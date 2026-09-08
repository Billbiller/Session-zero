import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getUserById } from "./auth";
import { notify } from "./notifications";
import { BOARD_TOPICS, BOARD_INFO } from "./types";
import type {
  BoardSlug,
  BoardInfo,
  BoardThread,
  BoardThreadWithAuthor,
  BoardReply,
  BoardReplyWithAuthor,
} from "./types";

export class BoardError extends Error {}

const MAX_TITLE = 200;
const MAX_THREAD_BODY = 10000;
const MAX_REPLY_BODY = 5000;

export function isBoardSlug(value: string): value is BoardSlug {
  return (BOARD_TOPICS as readonly string[]).includes(value);
}

export interface Board extends BoardInfo {
  slug: BoardSlug;
}

/** Every curated board, in the same order as BOARD_TOPICS -- mirrors
 * lib/systems.ts's listCuratedSystems() convention exactly. */
export function listBoards(): Board[] {
  return BOARD_TOPICS.map((slug) => ({ slug, ...BOARD_INFO[slug] }));
}

/** Null for an unrecognized slug, so callers (the /boards/[slug] page and
 * its API routes) can 404 cleanly -- same convention as
 * lib/systems.ts's getCuratedSystem(). */
export function getBoard(slug: string): Board | null {
  if (!isBoardSlug(slug)) return null;
  return { slug, ...BOARD_INFO[slug] };
}

function replyCountFor(threadId: string): number {
  return (
    db.prepare("SELECT COUNT(*) as count FROM board_replies WHERE thread_id = ?").get(
      threadId
    ) as { count: number }
  ).count;
}

function enrichThread(row: BoardThread): BoardThreadWithAuthor {
  return {
    ...row,
    authorName: getUserById(row.author_id)?.display_name ?? "Unknown",
    replyCount: replyCountFor(row.id),
  };
}

/** Threads for a board, newest first, paginated -- the same
 * page/pageSize/total shape as lib/campaigns.ts's listCampaigns() and
 * lib/systems.ts's campaignsForSystem(). Returns null for an unrecognized
 * slug, distinct from a real board with zero threads yet ({ items: [],
 * total: 0 }). Browsing is public -- no access check here, matching
 * campaign browsing/the sub pool/system hubs, all of which are also
 * ungated reads. */
export function listThreads(
  slug: string,
  opts: { page?: number; pageSize?: number } = {}
): { items: BoardThreadWithAuthor[]; total: number } | null {
  if (!isBoardSlug(slug)) return null;
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const total = (
    db.prepare("SELECT COUNT(*) as count FROM board_threads WHERE board_slug = ?").get(
      slug
    ) as { count: number }
  ).count;
  const rows = db
    .prepare(
      "SELECT * FROM board_threads WHERE board_slug = ? ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?"
    )
    .all(slug, pageSize, (page - 1) * pageSize) as BoardThread[];
  return { items: rows.map(enrichThread), total };
}

function getThreadRow(threadId: string): BoardThread | null {
  const row = db.prepare("SELECT * FROM board_threads WHERE id = ?").get(threadId) as
    | BoardThread
    | undefined;
  return row ?? null;
}

export function getThread(threadId: string): BoardThread | null {
  return getThreadRow(threadId);
}

export function getThreadWithAuthor(threadId: string): BoardThreadWithAuthor | null {
  const row = getThreadRow(threadId);
  return row ? enrichThread(row) : null;
}

function validateTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) throw new BoardError("Title can't be empty.");
  if (trimmed.length > MAX_TITLE) {
    throw new BoardError(`Title can't be longer than ${MAX_TITLE} characters.`);
  }
  return trimmed;
}

function validatePostBody(body: string, max: number, label: string): string {
  const trimmed = body.trim();
  if (!trimmed) throw new BoardError(`${label} can't be empty.`);
  if (trimmed.length > max) {
    throw new BoardError(`${label} can't be longer than ${max} characters.`);
  }
  return trimmed;
}

/** Starts a new thread on a curated board. Any signed-in user may post --
 * there's no user-created board (boardSlug must be one of the fixed
 * BOARD_TOPICS), but starting a thread on an existing board has no
 * relationship gate, matching the openness already established for
 * messaging (#31) and the sub-request pool. */
export function createThread(
  boardSlug: string,
  authorId: string,
  input: { title: string; body: string }
): BoardThread {
  if (!isBoardSlug(boardSlug)) throw new BoardError("Unknown board.");
  const title = validateTitle(input.title);
  const body = validatePostBody(input.body, MAX_THREAD_BODY, "Post");
  const now = new Date().toISOString();
  const thread: BoardThread = {
    id: uuidv4(),
    board_slug: boardSlug,
    author_id: authorId,
    title,
    body,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO board_threads (id, board_slug, author_id, title, body, created_at, updated_at)
     VALUES (@id, @board_slug, @author_id, @title, @body, @created_at, @updated_at)`
  ).run(thread);
  return thread;
}

/** "Light moderation" for this first pass (backlog #37's own scope) means
 * self-moderation only -- a thread/reply's own author can delete it, and
 * there is no admin/reporting system, unlike e.g. campaign resources
 * where the DM is also a backstop moderator. Boards aren't campaign-
 * scoped, so there's no DM-equivalent role to lean on here. */
function requireAuthor(authorId: string, userId: string, what: string): void {
  if (authorId !== userId) {
    throw new BoardError(`Only the person who posted this ${what} can delete it.`);
  }
}

/** Deletes a thread and every reply on it. Author-only (see
 * requireAuthor above) -- there is no edit affordance for this first pass,
 * only delete-and-repost, keeping the write surface intentionally small. */
export function deleteThread(threadId: string, userId: string): void {
  const thread = getThreadRow(threadId);
  if (!thread) throw new BoardError("Thread not found.");
  requireAuthor(thread.author_id, userId, "thread");
  // Backlog #43: a notifications row may reference this thread
  // (related_thread_id REFERENCES board_threads(id)) -- null that link out
  // rather than deleting the notification itself, same convention as
  // lib/characters.ts's deleteCharacter() nulling feed_events.character_id.
  // The notification's message already has the thread's title baked in as
  // plain text at creation time, so it stays meaningful once the thread
  // itself is gone.
  db.prepare(
    "UPDATE notifications SET related_thread_id = NULL WHERE related_thread_id = ?"
  ).run(threadId);
  db.prepare("DELETE FROM board_replies WHERE thread_id = ?").run(threadId);
  db.prepare("DELETE FROM board_threads WHERE id = ?").run(threadId);
}

/** Every reply on a thread, oldest first (flat, not nested -- see
 * BoardReply's doc comment in lib/types.ts), enriched with each author's
 * display name. */
export function listReplies(threadId: string): BoardReplyWithAuthor[] {
  const rows = db
    .prepare("SELECT * FROM board_replies WHERE thread_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(threadId) as BoardReply[];
  return rows.map((row) => ({
    ...row,
    authorName: getUserById(row.author_id)?.display_name ?? "Unknown",
  }));
}

function getReplyRow(replyId: string): BoardReply | null {
  const row = db.prepare("SELECT * FROM board_replies WHERE id = ?").get(replyId) as
    | BoardReply
    | undefined;
  return row ?? null;
}

export function getReply(replyId: string): BoardReply | null {
  return getReplyRow(replyId);
}

/** Posts a reply to a thread. Any signed-in user may reply, including the
 * thread's own author -- no relationship gate, same reasoning as
 * createThread above.
 *
 * Notification (backlog #43): the thread's own author is notified on
 * every reply from someone else -- not batched/first-unread-only like
 * lib/campaignMessages.ts's campaign_chat_message, since a discussion
 * board thread sees far lower reply volume than a live table chat (the
 * closer precedent is lib/messages.ts's message_received, which also
 * notifies on every message with no batching). No notification on a
 * self-reply (the author replying to their own thread). This closes the
 * gap backlog #37's own session log entry explicitly flagged: posting a
 * thread gave no way to know anyone had replied to it. Only the thread's
 * original author is notified, not every other participant in the
 * thread -- that's the concrete gap this item names; a broader
 * "subscribe to a thread" notification model is a separate, bigger
 * feature this pass doesn't attempt. */
export function createReply(threadId: string, authorId: string, body: string): BoardReply {
  const thread = getThreadRow(threadId);
  if (!thread) throw new BoardError("Thread not found.");
  const trimmed = validatePostBody(body, MAX_REPLY_BODY, "Reply");
  const now = new Date().toISOString();
  const reply: BoardReply = {
    id: uuidv4(),
    thread_id: threadId,
    author_id: authorId,
    body: trimmed,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO board_replies (id, thread_id, author_id, body, created_at, updated_at)
     VALUES (@id, @thread_id, @author_id, @body, @created_at, @updated_at)`
  ).run(reply);

  if (thread.author_id !== authorId) {
    const replier = getUserById(authorId);
    const boardName = BOARD_INFO[thread.board_slug].name;
    notify(
      thread.author_id,
      "board_reply",
      null,
      `${replier?.display_name ?? "Someone"} replied to your thread "${thread.title}" on ${boardName}.`,
      null,
      threadId
    );
  }

  return reply;
}

/** Deletes a single reply. Author-only, same self-moderation boundary as
 * deleteThread -- deleting a reply never cascades (it has nothing under
 * it, replies are flat). */
export function deleteReply(replyId: string, userId: string): void {
  const reply = getReplyRow(replyId);
  if (!reply) throw new BoardError("Reply not found.");
  requireAuthor(reply.author_id, userId, "reply");
  db.prepare("DELETE FROM board_replies WHERE id = ?").run(replyId);
}
