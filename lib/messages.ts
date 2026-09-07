import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getUserById } from "./auth";
import { notify } from "./notifications";
import type { Message, ConversationSummary } from "./types";

export class MessageError extends Error {}

const MAX_BODY = 4000;

/** Sends a 1:1 direct message. Backlog #31's open question -- "who can
 * message whom" -- is resolved here: any signed-in user can message any
 * other signed-in user, no prerequisite relationship required. This
 * matches the openness already established elsewhere in this app
 * (browsing campaigns, volunteering for a sub request, viewing a public
 * player profile all have no gating relationship either) rather than
 * inventing a new "you must share a campaign / have a pending join
 * request" restriction this backlog line only floated as one option. The
 * one hard rule is you can't message yourself. */
export function sendMessage(senderId: string, recipientId: string, body: string): Message {
  if (senderId === recipientId) {
    throw new MessageError("You can't message yourself.");
  }
  const recipient = getUserById(recipientId);
  if (!recipient) {
    throw new MessageError("Recipient not found.");
  }
  const trimmed = body.trim();
  if (!trimmed) {
    throw new MessageError("Message can't be empty.");
  }
  if (trimmed.length > MAX_BODY) {
    throw new MessageError(`Message can't be longer than ${MAX_BODY} characters.`);
  }
  const message: Message = {
    id: uuidv4(),
    sender_id: senderId,
    recipient_id: recipientId,
    body: trimmed,
    read: 0,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO messages (id, sender_id, recipient_id, body, read, created_at)
     VALUES (@id, @sender_id, @recipient_id, @body, @read, @created_at)`
  ).run(message);

  const sender = getUserById(senderId);
  notify(
    recipientId,
    "message_received",
    null,
    `${sender?.display_name ?? "Someone"} sent you a message.`,
    senderId
  );

  return message;
}

function countUnreadFrom(otherUserId: string, viewerId: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM messages WHERE sender_id = ? AND recipient_id = ? AND read = 0"
    )
    .get(otherUserId, viewerId) as { count: number };
  return row.count;
}

/** The signed-in user's inbox: one row per conversation partner, ordered
 * most-recently-active first. A "conversation" isn't a stored entity --
 * this walks every message involving the viewer, newest first, and keeps
 * only the first (i.e. most recent) row seen per partner, which is both
 * the dedup step and the ordering in one pass. Deliberately done in JS
 * rather than a SQL window function: this codebase's existing list/join
 * helpers (e.g. lib/subRequests.ts's withContext) already favor a plain
 * query plus a JS pass over more exotic SQL, and the per-user message
 * volume here is small enough that this stays cheap. */
export function listConversations(userId: string): ConversationSummary[] {
  const rows = db
    .prepare(
      `SELECT * FROM messages WHERE sender_id = ? OR recipient_id = ?
       ORDER BY created_at DESC, rowid DESC`
    )
    .all(userId, userId) as Message[];

  const seen = new Set<string>();
  const conversations: ConversationSummary[] = [];
  for (const row of rows) {
    const otherUserId = row.sender_id === userId ? row.recipient_id : row.sender_id;
    if (seen.has(otherUserId)) continue;
    seen.add(otherUserId);
    const otherUser = getUserById(otherUserId);
    conversations.push({
      otherUserId,
      otherUserName: otherUser?.display_name ?? "Unknown",
      lastMessage: {
        body: row.body,
        createdAt: row.created_at,
        senderId: row.sender_id,
      },
      unreadCount: countUnreadFrom(otherUserId, userId),
    });
  }
  return conversations;
}

/** Every message between two users, oldest first (chat-reading order).
 * Callers are always one of the two participants in practice (the API
 * route only ever passes the signed-in user as one side), so there's no
 * separate access check here -- unlike e.g. hasPrivateAccess, there's no
 * third party who could pass an arbitrary pair. */
export function getConversation(userId: string, otherUserId: string): Message[] {
  return db
    .prepare(
      `SELECT * FROM messages
       WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
       ORDER BY created_at ASC, rowid ASC`
    )
    .all(userId, otherUserId, otherUserId, userId) as Message[];
}

/** Marks every message *from* otherUserId *to* userId as read -- called
 * as a side effect of opening a conversation (the natural "you've seen
 * this" moment for a chat thread), not as a separate explicit action the
 * way notifications' markRead/markAllRead are. This is independent of
 * the message_received notification's own read state; reading a
 * conversation doesn't retroactively mark its notifications read (no
 * reliable way to map one to the other without new bookkeeping, and the
 * notifications inbox already lets a user clear those separately). */
export function markConversationRead(userId: string, otherUserId: string): void {
  db.prepare(
    "UPDATE messages SET read = 1 WHERE sender_id = ? AND recipient_id = ? AND read = 0"
  ).run(otherUserId, userId);
}
