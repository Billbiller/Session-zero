import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getUserById } from "./auth";
import { notify } from "./notifications";
import type { Friendship, FriendshipViewerStatus } from "./types";

export class FriendError extends Error {}

/** The one row (if any) that exists between two users, in either
 * direction -- see lib/db.ts's friendships table comment for why the
 * UNIQUE constraint is directional and this lookup has to check both
 * orderings itself. At most one row can exist between any given pair at
 * a time; every mutating function below re-derives this before acting
 * rather than trusting a caller-supplied friendship id to belong to the
 * two users it claims to. */
function relationshipBetween(userIdA: string, userIdB: string): Friendship | null {
  const row = db
    .prepare(
      `SELECT * FROM friendships
       WHERE (requester_id = ? AND addressee_id = ?)
          OR (requester_id = ? AND addressee_id = ?)`
    )
    .get(userIdA, userIdB, userIdB, userIdA) as Friendship | undefined;
  return row ?? null;
}

export function areFriends(userIdA: string, userIdB: string): boolean {
  const row = relationshipBetween(userIdA, userIdB);
  return !!row && row.status === "accepted";
}

/** The viewer-relative status driving /players/[id]'s FriendButton --
 * see FriendshipViewerStatus's own doc comment on lib/types.ts. */
export function getFriendshipStatus(
  viewerId: string,
  otherUserId: string
): FriendshipViewerStatus {
  if (viewerId === otherUserId) return "self";
  const row = relationshipBetween(viewerId, otherUserId);
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.requester_id === viewerId ? "request_sent" : "request_received";
}

export function sendFriendRequest(requesterId: string, addresseeId: string): Friendship {
  if (requesterId === addresseeId) {
    throw new FriendError("You can't send yourself a friend request.");
  }
  if (!getUserById(addresseeId)) {
    throw new FriendError("User not found.");
  }
  const existing = relationshipBetween(requesterId, addresseeId);
  if (existing) {
    throw new FriendError(
      existing.status === "accepted"
        ? "You're already friends."
        : "There's already a pending request between you two."
    );
  }
  const now = new Date().toISOString();
  const row: Friendship = {
    id: uuidv4(),
    requester_id: requesterId,
    addressee_id: addresseeId,
    status: "pending",
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at)
     VALUES (@id, @requester_id, @addressee_id, @status, @created_at, @updated_at)`
  ).run(row);

  const requester = getUserById(requesterId);
  notify(
    addresseeId,
    "friend_request",
    null,
    `${requester?.display_name ?? "Someone"} sent you a friend request.`,
    requesterId
  );
  return row;
}

/** Only the addressee of a still-pending request can accept it --
 * accepting isn't the same action as sending, so unlike
 * cancelOrRemoveFriendship() below this can't be collapsed into a
 * single "either side, any state" function. requesterId identifies
 * which pending request to accept the same way the rest of this module
 * addresses relationships: by the other user's id, not a friendship
 * row id -- there's at most one relationship between any two users, so
 * that's always unambiguous. */
export function acceptFriendRequest(addresseeId: string, requesterId: string): Friendship {
  const row = relationshipBetween(addresseeId, requesterId);
  if (!row || row.status !== "pending" || row.addressee_id !== addresseeId) {
    throw new FriendError("No pending friend request from that user.");
  }
  const updated_at = new Date().toISOString();
  db.prepare("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?").run(
    updated_at,
    row.id
  );

  const addressee = getUserById(addresseeId);
  notify(
    requesterId,
    "friend_request_accepted",
    null,
    `${addressee?.display_name ?? "Someone"} accepted your friend request.`,
    addresseeId
  );
  return { ...row, status: "accepted", updated_at };
}

/** Removes whatever relationship (if any) exists between the two users
 * -- a pending request the caller sent (cancel), a pending request the
 * caller received (decline), or an accepted friendship (unfriend). All
 * three are "delete the one row between us" from the data's point of
 * view, so -- mirroring lib/follows.ts's unfollow() -- this is a single
 * idempotent no-op-if-nothing-there function rather than three separate
 * cancel/decline/unfriend entry points that would all do the same
 * thing under a different name. */
export function cancelOrRemoveFriendship(userId: string, otherUserId: string): void {
  db.prepare(
    `DELETE FROM friendships
     WHERE (requester_id = ? AND addressee_id = ?)
        OR (requester_id = ? AND addressee_id = ?)`
  ).run(userId, otherUserId, otherUserId, userId);
}

export interface FriendListEntry {
  id: string;
  display_name: string;
  since: string;
}

/** The other user in every accepted friendship this user is part of,
 * most-recently-accepted first. Direction (who originally sent the
 * request) is deliberately not exposed here -- once accepted it isn't
 * meaningful, per the friendships table's own comment. */
export function listFriends(userId: string): FriendListEntry[] {
  const rows = db
    .prepare(
      `SELECT * FROM friendships
       WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)
       ORDER BY updated_at DESC, rowid DESC`
    )
    .all(userId, userId) as Friendship[];
  return rows
    .map((row) => {
      const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
      const other = getUserById(otherId);
      if (!other) return null;
      return { id: other.id, display_name: other.display_name, since: row.updated_at };
    })
    .filter((entry): entry is FriendListEntry => entry !== null);
}

export interface PendingRequestEntry {
  id: string;
  display_name: string;
  requested_at: string;
}

/** Pending requests sent *to* this user, awaiting their accept/decline. */
export function listPendingReceived(userId: string): PendingRequestEntry[] {
  const rows = db
    .prepare(
      `SELECT * FROM friendships WHERE status = 'pending' AND addressee_id = ?
       ORDER BY created_at DESC, rowid DESC`
    )
    .all(userId) as Friendship[];
  return rows
    .map((row) => {
      const requester = getUserById(row.requester_id);
      if (!requester) return null;
      return { id: requester.id, display_name: requester.display_name, requested_at: row.created_at };
    })
    .filter((entry): entry is PendingRequestEntry => entry !== null);
}

/** Pending requests this user sent, awaiting the other side's response. */
export function listPendingSent(userId: string): PendingRequestEntry[] {
  const rows = db
    .prepare(
      `SELECT * FROM friendships WHERE status = 'pending' AND requester_id = ?
       ORDER BY created_at DESC, rowid DESC`
    )
    .all(userId) as Friendship[];
  return rows
    .map((row) => {
      const addressee = getUserById(row.addressee_id);
      if (!addressee) return null;
      return { id: addressee.id, display_name: addressee.display_name, requested_at: row.created_at };
    })
    .filter((entry): entry is PendingRequestEntry => entry !== null);
}

export function friendCount(userId: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)"
    )
    .get(userId, userId) as { count: number };
  return row.count;
}
