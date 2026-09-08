import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getUserById } from "./auth";
import { notify } from "./notifications";
import { isSiteAdmin } from "./access";
import { escapeLikePattern } from "./campaigns";
import { BOARD_TOPICS, BOARD_INFO } from "./types";
import type {
  BoardSlug,
  BoardInfo,
  BoardThread,
  BoardThreadWithAuthor,
  BoardReply,
  BoardReplyWithAuthor,
  BoardReport,
  ReportedBoardPost,
} from "./types";

export class BoardError extends Error {}

const MAX_TITLE = 200;
const MAX_THREAD_BODY = 10000;
const MAX_REPLY_BODY = 5000;
const MAX_REPORT_REASON = 500;
const REPORT_EXCERPT_LENGTH = 200;

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

/** "Light moderation" for backlog #37's original first pass meant
 * self-moderation only. Backlog #48 adds the backstop that pass's own
 * session log explicitly flagged as missing: a site admin (users.is_admin,
 * see lib/access.ts's isSiteAdmin) can also delete any thread or reply,
 * mirroring how a campaign's DM is already a backstop moderator for
 * campaign resources/session log entries -- boards aren't campaign-scoped,
 * so a site-wide admin role is the equivalent backstop here. */
function requireAuthorOrAdmin(authorId: string, userId: string, what: string): void {
  if (authorId === userId) return;
  if (isSiteAdmin(userId)) return;
  throw new BoardError(`Only the person who posted this ${what}, or a site admin, can delete it.`);
}

/** Deletes a thread and every reply on it. Author-or-admin only (see
 * requireAuthorOrAdmin above) -- there is no edit affordance for this
 * first pass, only delete-and-repost, keeping the write surface
 * intentionally small. */
export function deleteThread(threadId: string, userId: string): void {
  const thread = getThreadRow(threadId);
  if (!thread) throw new BoardError("Thread not found.");
  requireAuthorOrAdmin(thread.author_id, userId, "thread");
  // Backlog #48: board_reports rows reference this thread (thread_id
  // REFERENCES board_threads(id)) and, for reports on any of its replies,
  // reference those replies (reply_id REFERENCES board_replies(id)) --
  // both must be deleted before the thread/replies themselves, or the
  // foreign_keys=ON pragma (lib/db.ts) rejects the delete. Unlike the
  // notifications null-out below, report rows are deleted outright: once
  // an admin has removed the content, there's nothing left to review.
  db.prepare("DELETE FROM board_reports WHERE thread_id = ?").run(threadId);
  db.prepare(
    "DELETE FROM board_reports WHERE reply_id IN (SELECT id FROM board_replies WHERE thread_id = ?)"
  ).run(threadId);
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

/** Deletes a single reply. Author-or-admin only, same boundary as
 * deleteThread -- deleting a reply never cascades (it has nothing under
 * it, replies are flat). */
export function deleteReply(replyId: string, userId: string): void {
  const reply = getReplyRow(replyId);
  if (!reply) throw new BoardError("Reply not found.");
  requireAuthorOrAdmin(reply.author_id, userId, "reply");
  db.prepare("DELETE FROM board_reports WHERE reply_id = ?").run(replyId);
  db.prepare("DELETE FROM board_replies WHERE id = ?").run(replyId);
}

function validateReportReason(reason: string | undefined): string {
  const trimmed = (reason ?? "").trim();
  if (trimmed.length > MAX_REPORT_REASON) {
    throw new BoardError(`Reason can't be longer than ${MAX_REPORT_REASON} characters.`);
  }
  return trimmed;
}

/** Whether reporterId has already reported this thread -- used both to
 * reject a duplicate report (see reportThread below) and by the thread
 * page to hide/relabel the Report button for something the viewer's
 * already flagged, the same per-viewer-state convention as e.g.
 * sub-request volunteering's viewerHasVolunteered. */
export function hasReportedThread(threadId: string, reporterId: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM board_reports WHERE thread_id = ? AND reporter_id = ?")
    .get(threadId, reporterId);
  return !!row;
}

export function hasReportedReply(replyId: string, reporterId: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM board_reports WHERE reply_id = ? AND reporter_id = ?")
    .get(replyId, reporterId);
  return !!row;
}

/** Backlog #48: files a report against a thread for a site admin to
 * review (see listReportedContent below). Any signed-in user may report
 * any thread once -- including their own, technically (there's no
 * self-report special case here, since the UI simply never renders the
 * Report button next to a viewer's own post, the same "narrow surface,
 * not a hard rule" approach this app already takes with e.g. reportReply
 * below). A second report from the same reporter on the same thread is
 * rejected, not upserted -- mirrors lib/follows.ts's "already following"
 * duplicate-relationship convention. */
export function reportThread(threadId: string, reporterId: string, reason?: string): BoardReport {
  const thread = getThreadRow(threadId);
  if (!thread) throw new BoardError("Thread not found.");
  if (hasReportedThread(threadId, reporterId)) {
    throw new BoardError("You've already reported this.");
  }
  const report: BoardReport = {
    id: uuidv4(),
    reporter_id: reporterId,
    thread_id: threadId,
    reply_id: null,
    reason: validateReportReason(reason),
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO board_reports (id, reporter_id, thread_id, reply_id, reason, created_at)
     VALUES (@id, @reporter_id, @thread_id, @reply_id, @reason, @created_at)`
  ).run(report);
  return report;
}

/** Same as reportThread, one level down -- see that function's doc comment. */
export function reportReply(replyId: string, reporterId: string, reason?: string): BoardReport {
  const reply = getReplyRow(replyId);
  if (!reply) throw new BoardError("Reply not found.");
  if (hasReportedReply(replyId, reporterId)) {
    throw new BoardError("You've already reported this.");
  }
  const report: BoardReport = {
    id: uuidv4(),
    reporter_id: reporterId,
    thread_id: null,
    reply_id: replyId,
    reason: validateReportReason(reason),
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO board_reports (id, reporter_id, thread_id, reply_id, reason, created_at)
     VALUES (@id, @reporter_id, @thread_id, @reply_id, @reason, @created_at)`
  ).run(report);
  return report;
}

/** The admin moderation queue (/admin/boards): every thread or reply
 * that has at least one report, sorted by report count descending (ties
 * broken by the most recent report first, so a suddenly-hot post surfaces
 * ahead of an old one with the same count sitting untouched). A thread
 * and its own replies are independent entries here -- reporting a thread
 * doesn't imply anything about its replies or vice versa. Skips a report
 * whose underlying thread/reply has already been deleted (defensive only:
 * deleteThread/deleteReply both clean up their own board_reports rows, so
 * this shouldn't happen in practice, but a stale row is a display bug,
 * not a crash). */
export function listReportedContent(): ReportedBoardPost[] {
  const threadCounts = db
    .prepare(
      `SELECT thread_id AS id, COUNT(*) AS count, MAX(created_at) AS latest
       FROM board_reports WHERE thread_id IS NOT NULL GROUP BY thread_id`
    )
    .all() as { id: string; count: number; latest: string }[];
  const replyCounts = db
    .prepare(
      `SELECT reply_id AS id, COUNT(*) AS count, MAX(created_at) AS latest
       FROM board_reports WHERE reply_id IS NOT NULL GROUP BY reply_id`
    )
    .all() as { id: string; count: number; latest: string }[];

  const entries: { post: ReportedBoardPost; latestReportAt: string }[] = [];

  for (const row of threadCounts) {
    const thread = getThreadRow(row.id);
    if (!thread) continue;
    entries.push({
      post: {
        kind: "thread",
        id: thread.id,
        threadId: thread.id,
        boardSlug: thread.board_slug,
        authorId: thread.author_id,
        authorName: getUserById(thread.author_id)?.display_name ?? "Unknown",
        title: thread.title,
        excerpt: thread.body.slice(0, REPORT_EXCERPT_LENGTH),
        reportCount: row.count,
        createdAt: thread.created_at,
      },
      latestReportAt: row.latest,
    });
  }

  for (const row of replyCounts) {
    const reply = getReplyRow(row.id);
    if (!reply) continue;
    const parentThread = getThreadRow(reply.thread_id);
    if (!parentThread) continue;
    entries.push({
      post: {
        kind: "reply",
        id: reply.id,
        threadId: parentThread.id,
        boardSlug: parentThread.board_slug,
        authorId: reply.author_id,
        authorName: getUserById(reply.author_id)?.display_name ?? "Unknown",
        title: `Reply to "${parentThread.title}"`,
        excerpt: reply.body.slice(0, REPORT_EXCERPT_LENGTH),
        reportCount: row.count,
        createdAt: reply.created_at,
      },
      latestReportAt: row.latest,
    });
  }

  entries.sort((a, b) => {
    if (b.post.reportCount !== a.post.reportCount) return b.post.reportCount - a.post.reportCount;
    return b.latestReportAt.localeCompare(a.latestReportAt);
  });

  return entries.map((entry) => entry.post);
}

/** Backlog #52: a single search result -- a matching thread enriched the
 * same way listThreads()'s items are, plus whether the query matched the
 * thread's own title/body (`matchedInThread: true`) or was only found
 * inside one of its replies (`matchedInThread: false`). A reply isn't
 * independently browsable/linkable the way a thread is, so a reply-only
 * match still surfaces its parent thread -- the searcher lands on the
 * thread and can read the matching reply in context, rather than getting
 * zero results for a question that was actually answered in a reply. */
export interface BoardSearchResultItem extends BoardThreadWithAuthor {
  matchedInThread: boolean;
}

/** Cross-board keyword search (backlog #52): as the four boards accumulate
 * threads, there was no way to search across them at all -- a user had to
 * guess which board a relevant past thread might live on and page through
 * it by hand. Mirrors lib/campaigns.ts's listCampaigns() `q` keyword
 * search exactly (case-insensitive substring, escapeLikePattern-escaped so
 * `%`/`_` in a query are treated as literal characters, same
 * page/pageSize/total pagination shape) plus one addition: the match can
 * also come from any reply on the thread, not just the thread's own
 * title/body, via a correlated EXISTS subquery against board_replies --
 * otherwise a real answer sitting in a reply would never surface at all.
 *
 * An empty/whitespace-only query returns { items: [], total: 0 } rather
 * than every thread on every board -- this is a search, not a second
 * "browse everything" view (that's what /boards + each board's own page
 * are already for). Optional boardSlug scopes the search to one board
 * (used by a per-board search box, if one is ever added); an unrecognized
 * slug is silently ignored rather than erroring, matching this file's
 * existing isBoardSlug-guard convention elsewhere (e.g. getBoard). */
export function searchBoards(
  q: string,
  opts: { boardSlug?: string; page?: number; pageSize?: number } = {}
): { items: BoardSearchResultItem[]; total: number } {
  const keyword = q.trim();
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  if (!keyword) return { items: [], total: 0 };

  const pattern = `%${escapeLikePattern(keyword.toLowerCase())}%`;
  const where = [
    `(LOWER(bt.title) LIKE @q ESCAPE '\\' OR LOWER(bt.body) LIKE @q ESCAPE '\\' OR EXISTS (
      SELECT 1 FROM board_replies br WHERE br.thread_id = bt.id AND LOWER(br.body) LIKE @q ESCAPE '\\'
    ))`,
  ];
  const params: Record<string, unknown> = { q: pattern };
  if (opts.boardSlug && isBoardSlug(opts.boardSlug)) {
    where.push("bt.board_slug = @boardSlug");
    params.boardSlug = opts.boardSlug;
  }
  const whereClause = where.join(" AND ");

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM board_threads bt WHERE ${whereClause}`).get(
      params
    ) as { count: number }
  ).count;
  const rows = db
    .prepare(
      `SELECT bt.* FROM board_threads bt WHERE ${whereClause}
       ORDER BY bt.created_at DESC, bt.rowid DESC LIMIT @pageSize OFFSET @offset`
    )
    .all({ ...params, pageSize, offset: (page - 1) * pageSize }) as BoardThread[];

  const lowerKeyword = keyword.toLowerCase();
  const items = rows.map((row) => {
    const matchedInThread =
      row.title.toLowerCase().includes(lowerKeyword) || row.body.toLowerCase().includes(lowerKeyword);
    return { ...enrichThread(row), matchedInThread };
  });

  return { items, total };
}
