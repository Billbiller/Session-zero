import db from "./db";
import { rowToCampaign, type CampaignRow } from "./campaigns";
import { getProfile } from "./profiles";
import { listCharactersForUser } from "./characters";
import { getAvailabilitySlots } from "./availability";
import { getPreferences } from "./notificationPreferences";
import { getUserStats } from "./stats";
import type {
  AccountExportData,
  BoardReply,
  BoardReport,
  BoardThread,
  CampaignMessage,
  CampaignResource,
  FeedEvent,
  InitiativeEntry,
  Membership,
  Message,
  Notification,
  NpcNote,
  Rating,
  CampaignRating,
  SessionLogAttendance,
  SessionLogEntry,
  SessionRsvp,
  SubPlacement,
  SubRequest,
  SubVolunteer,
} from "./types";

export class AccountExportError extends Error {}

interface TaggedRow {
  tags: string;
}

/** ratings.tags and campaign_ratings.tags are both stored as JSON-encoded
 * TEXT columns (the same pattern campaigns.tone_tags uses) -- their own
 * lib files each keep a private, unexported rowToRating() that does this
 * exact parse. Duplicated here (rather than exporting either one) since
 * pulling a private helper out of two otherwise-unrelated files for a
 * single call site each isn't worth the coupling. */
function parseTags<T extends TaggedRow>(row: T): Omit<T, "tags"> & { tags: string[] } {
  let tags: string[];
  try {
    const parsed = JSON.parse(row.tags);
    tags = Array.isArray(parsed) ? parsed : [];
  } catch {
    tags = [];
  }
  return { ...row, tags };
}

/** Builds a signed-in user's complete self-service data export -- every
 * row across this app's schema that traces back to their own account.
 * See AccountExportData's own doc comment in lib/types.ts for the full
 * scope writeup, including why account *deletion* isn't built alongside
 * this (a DM-owned campaign with an active party can't be safely
 * hard-deleted without a product decision this pass didn't make).
 *
 * Deliberately takes no viewer/access parameter beyond userId itself --
 * unlike every other lib/*.ts function that reads another user's data,
 * this one is designed to only ever be called with the requesting user's
 * own id (see app/api/account/export/route.ts, which passes
 * requireUser()'s own auth.user.id and nothing else), so there's no
 * access check to get wrong here. */
export function getAccountExport(userId: string): AccountExportData {
  const userRow = db
    .prepare("SELECT id, display_name, email, is_admin, created_at FROM users WHERE id = ?")
    .get(userId) as
    | { id: string; display_name: string; email: string; is_admin: number; created_at: string }
    | undefined;
  if (!userRow) throw new AccountExportError("Account not found.");

  const campaignsAsDm = (
    db
      .prepare("SELECT * FROM campaigns WHERE dm_id = ? ORDER BY created_at ASC, rowid ASC")
      .all(userId) as CampaignRow[]
  ).map(rowToCampaign);

  const memberships = db
    .prepare(
      `SELECT memberships.*, campaigns.title as campaignTitle
       FROM memberships
       JOIN campaigns ON campaigns.id = memberships.campaign_id
       WHERE memberships.user_id = ?
       ORDER BY memberships.created_at ASC, memberships.rowid ASC`
    )
    .all(userId) as (Membership & { campaignTitle: string })[];

  const subRequestsPosted = db
    .prepare("SELECT * FROM sub_requests WHERE requester_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as SubRequest[];

  const subVolunteered = db
    .prepare("SELECT * FROM sub_volunteers WHERE volunteer_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as SubVolunteer[];

  // Both sides of the sub-placement approval workflow this user could
  // appear on: as the volunteer directly, or as the owner (always the
  // parent request's own requester -- see lib/subRequests.ts) whose
  // character was placed.
  const subPlacements = db
    .prepare(
      `SELECT sub_placements.* FROM sub_placements
       JOIN sub_requests ON sub_requests.id = sub_placements.request_id
       WHERE sub_placements.volunteer_id = ? OR sub_requests.requester_id = ?
       ORDER BY sub_placements.created_at ASC, sub_placements.rowid ASC`
    )
    .all(userId, userId) as SubPlacement[];

  const directMessagesSent = db
    .prepare("SELECT * FROM messages WHERE sender_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as Message[];

  const directMessagesReceived = db
    .prepare("SELECT * FROM messages WHERE recipient_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as Message[];

  const campaignMessagesSent = db
    .prepare("SELECT * FROM campaign_messages WHERE sender_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as CampaignMessage[];

  const ratingsGivenRaw = db
    .prepare("SELECT * FROM ratings WHERE rater_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as (Omit<Rating, "tags"> & { tags: string })[];
  const ratingsGiven = ratingsGivenRaw.map(parseTags);

  const ratingsReceivedRaw = db
    .prepare("SELECT * FROM ratings WHERE ratee_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as (Omit<Rating, "tags"> & { tags: string })[];
  const ratingsReceived = ratingsReceivedRaw.map(parseTags);

  const campaignRatingsGivenRaw = db
    .prepare("SELECT * FROM campaign_ratings WHERE rater_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as (Omit<CampaignRating, "tags"> & { tags: string })[];
  const campaignRatingsGiven = campaignRatingsGivenRaw.map(parseTags);

  const sessionLogEntriesAuthored = db
    .prepare("SELECT * FROM session_log_entries WHERE author_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as SessionLogEntry[];

  const sessionLogKudosGiven = (
    db
      .prepare(
        "SELECT entry_id as entryId, created_at as createdAt FROM session_log_kudos WHERE user_id = ? ORDER BY created_at ASC, rowid ASC"
      )
      .all(userId) as { entryId: string; createdAt: string }[]
  );

  const notifications = db
    .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as Notification[];

  const following = db
    .prepare(
      `SELECT follows.followed_id as userId, users.display_name as displayName, follows.created_at as since
       FROM follows JOIN users ON users.id = follows.followed_id
       WHERE follows.follower_id = ?
       ORDER BY follows.created_at ASC, follows.rowid ASC`
    )
    .all(userId) as { userId: string; displayName: string; since: string }[];

  const followers = db
    .prepare(
      `SELECT follows.follower_id as userId, users.display_name as displayName, follows.created_at as since
       FROM follows JOIN users ON users.id = follows.follower_id
       WHERE follows.followed_id = ?
       ORDER BY follows.created_at ASC, follows.rowid ASC`
    )
    .all(userId) as { userId: string; displayName: string; since: string }[];

  const boardThreadsAuthored = db
    .prepare("SELECT * FROM board_threads WHERE author_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as BoardThread[];

  const boardRepliesAuthored = db
    .prepare("SELECT * FROM board_replies WHERE author_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as BoardReply[];

  const boardReportsFiled = db
    .prepare("SELECT * FROM board_reports WHERE reporter_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as BoardReport[];

  const feedEvents = db
    .prepare("SELECT * FROM feed_events WHERE actor_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as FeedEvent[];

  const sessionRsvps = db
    .prepare("SELECT * FROM session_rsvps WHERE user_id = ? ORDER BY updated_at ASC, rowid ASC")
    .all(userId) as SessionRsvp[];

  const sessionLogAttendanceRecorded = db
    .prepare("SELECT * FROM session_log_attendance WHERE user_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as SessionLogAttendance[];

  const campaignResourcesUploaded = db
    .prepare("SELECT * FROM campaign_resources WHERE uploader_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(userId) as CampaignResource[];

  const initiativeEntriesAsDm = db
    .prepare(
      `SELECT initiative_entries.* FROM initiative_entries
       JOIN campaigns ON campaigns.id = initiative_entries.campaign_id
       WHERE campaigns.dm_id = ?
       ORDER BY initiative_entries.campaign_id ASC, initiative_entries.order_index ASC`
    )
    .all(userId) as InitiativeEntry[];

  const npcNotesAsDm = db
    .prepare(
      `SELECT npc_notes.* FROM npc_notes
       JOIN campaigns ON campaigns.id = npc_notes.campaign_id
       WHERE campaigns.dm_id = ?
       ORDER BY npc_notes.created_at ASC, npc_notes.rowid ASC`
    )
    .all(userId) as NpcNote[];

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: userRow.id,
      displayName: userRow.display_name,
      email: userRow.email,
      isAdmin: userRow.is_admin === 1,
      createdAt: userRow.created_at,
    },
    profile: getProfile(userId),
    availabilitySlots: getAvailabilitySlots(userId),
    notificationPreferences: getPreferences(userId),
    characters: listCharactersForUser(userId),
    campaignsAsDm,
    memberships,
    subRequestsPosted,
    subVolunteered,
    subPlacements,
    directMessagesSent,
    directMessagesReceived,
    campaignMessagesSent,
    ratingsGiven,
    ratingsReceived,
    campaignRatingsGiven,
    sessionLogEntriesAuthored,
    sessionLogKudosGiven,
    notifications,
    following,
    followers,
    boardThreadsAuthored,
    boardRepliesAuthored,
    boardReportsFiled,
    feedEvents,
    sessionRsvps,
    sessionLogAttendanceRecorded,
    campaignResourcesUploaded,
    initiativeEntriesAsDm,
    npcNotesAsDm,
    stats: getUserStats(userId),
  };
}
