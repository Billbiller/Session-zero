import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getUserById } from "./auth";
import type { Follow } from "./types";

export class FollowError extends Error {}

/** Backlog #38's own "who can follow whom" question, resolved the same
 * way as backlog #31's "who can message whom": no prerequisite
 * relationship (e.g. shared campaign membership) is required -- any
 * signed-in user may follow any other signed-in user. See lib/db.ts's
 * follows table comment for the full reasoning. The only hard rules are
 * you can't follow yourself and you can't follow the same person twice. */
export function isFollowing(followerId: string, followedId: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?")
    .get(followerId, followedId);
  return !!row;
}

export function follow(followerId: string, followedId: string): Follow {
  if (followerId === followedId) {
    throw new FollowError("You can't follow yourself.");
  }
  if (!getUserById(followedId)) {
    throw new FollowError("User not found.");
  }
  if (isFollowing(followerId, followedId)) {
    throw new FollowError("You're already following them.");
  }
  const row: Follow = {
    id: uuidv4(),
    follower_id: followerId,
    followed_id: followedId,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO follows (id, follower_id, followed_id, created_at)
     VALUES (@id, @follower_id, @followed_id, @created_at)`
  ).run(row);
  return row;
}

/** Idempotent -- unfollowing someone you don't actually follow is a
 * silent no-op rather than an error, matching how this app already
 * treats similarly "just remove the relationship" actions (e.g.
 * toggleKudos's off case) rather than requiring the caller to
 * pre-check isFollowing() first. */
export function unfollow(followerId: string, followedId: string): void {
  db.prepare(
    "DELETE FROM follows WHERE follower_id = ? AND followed_id = ?"
  ).run(followerId, followedId);
}

export function listFollowingIds(followerId: string): string[] {
  const rows = db
    .prepare("SELECT followed_id FROM follows WHERE follower_id = ?")
    .all(followerId) as { followed_id: string }[];
  return rows.map((r) => r.followed_id);
}

/** How many people follow this user -- shown on their public
 * /players/[id] page, same "public reputation-adjacent number" category
 * as the existing rating aggregates. */
export function followerCount(userId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM follows WHERE followed_id = ?")
    .get(userId) as { count: number };
  return row.count;
}

export function followingCount(userId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM follows WHERE follower_id = ?")
    .get(userId) as { count: number };
  return row.count;
}
