import db from "./db";
import { getCampaign } from "./campaigns";
import { getUserById } from "./auth";
import { activePartyUserIds } from "./access";
import type { AttendanceStats, SessionLogAttendanceSummary } from "./types";

export class AttendanceError extends Error {}

interface SessionLogEntryRow {
  id: string;
  campaign_id: string;
  author_id: string;
}

function getEntryForAttendance(entryId: string): SessionLogEntryRow | null {
  const row = db
    .prepare("SELECT id, campaign_id, author_id FROM session_log_entries WHERE id = ?")
    .get(entryId) as SessionLogEntryRow | undefined;
  return row ?? null;
}

/** Who attendance can be recorded for on a campaign right now -- the
 * active party (DM + approved members, see lib/access.ts's
 * activePartyUserIds) minus the DM themselves. The DM is excluded on
 * purpose: they're presumed present for every entry they post (they
 * wrote the recap), so this signal is scoped to players, matching the
 * sub-request pool's own "reliability rating requested" framing, which
 * is about players/subs showing up, not the table's own DM. */
export function attendanceCandidates(campaignId: string): string[] {
  const campaign = getCampaign(campaignId);
  if (!campaign) return [];
  return activePartyUserIds(campaignId).filter((id) => id !== campaign.dm_id);
}

/** Every current attendance-marking candidate for one entry, enriched
 * with the DM's recorded attended value (null = not recorded yet). No
 * auth check of its own -- a read helper, matching lib/npcNotes.ts's
 * listNpcNotes()/lib/sessionRsvps.ts's listRsvps() convention where the
 * DM-only access check lives at the route. Per-entry attendance is kept
 * DM-only to view (not shown to the whole party like the session log
 * itself) -- "who missed this specific session" is more pointed than
 * this app wants to surface widely; only the aggregate rate
 * (getAttendanceStats) is ever shown publicly. */
export function listEntryAttendance(entryId: string): SessionLogAttendanceSummary[] {
  const entry = getEntryForAttendance(entryId);
  if (!entry) throw new AttendanceError("Entry not found.");

  const candidates = attendanceCandidates(entry.campaign_id);
  const rows = db
    .prepare("SELECT user_id, attended FROM session_log_attendance WHERE entry_id = ?")
    .all(entryId) as { user_id: string; attended: number }[];
  const byUser = new Map(rows.map((r) => [r.user_id, !!r.attended]));

  return candidates.map((userId) => ({
    userId,
    userName: getUserById(userId)?.display_name ?? "Unknown",
    attended: byUser.has(userId) ? (byUser.get(userId) as boolean) : null,
  }));
}

/** Sets (full-replace, mirrors lib/availability.ts's
 * setAvailabilitySlots -- the UI always submits the complete current
 * checklist rather than individual toggles) which of a session log
 * entry's current attendance candidates actually showed up. DM-only --
 * only the campaign's own DM can attest attendance, the same authorship
 * boundary session log entries themselves already enforce (see
 * lib/sessionLog.ts's createEntry/updateEntry). Rejects any userId
 * that isn't a current candidate (see attendanceCandidates) rather than
 * silently accepting it, so a stale or forged client request can't
 * fabricate attendance for someone with no current relationship to the
 * campaign.
 *
 * Known limitation, documented rather than silently accepted:
 * candidates are computed from the CURRENT active party, not from who
 * was actually an approved member back when the entry was originally
 * logged -- this app has no point-in-time membership history to
 * reconstruct "who was really on the roster then" (the same category of
 * gap as backlog #19's chronicle only counting currently-linked
 * characters, not a full historical roster). In practice this only
 * matters when editing attendance on an old entry well after the roster
 * has changed; marking it at the moment the entry is first posted (the
 * common case, wired into the session log form) reflects the real party
 * at the time. */
export function setEntryAttendance(
  entryId: string,
  dmId: string,
  records: { userId: string; attended: boolean }[]
): SessionLogAttendanceSummary[] {
  const entry = getEntryForAttendance(entryId);
  if (!entry) throw new AttendanceError("Entry not found.");
  const campaign = getCampaign(entry.campaign_id);
  if (!campaign) throw new AttendanceError("Campaign not found.");
  if (campaign.dm_id !== dmId) {
    throw new AttendanceError("Only the DM can record attendance for this entry.");
  }

  const candidates = new Set(attendanceCandidates(entry.campaign_id));
  const seen = new Set<string>();
  const clean: { userId: string; attended: boolean }[] = [];
  for (const record of records) {
    if (!candidates.has(record.userId)) {
      throw new AttendanceError(
        "Can only record attendance for a current active party member."
      );
    }
    if (seen.has(record.userId)) continue;
    seen.add(record.userId);
    clean.push({ userId: record.userId, attended: !!record.attended });
  }

  const now = new Date().toISOString();
  const replace = db.transaction((rows: { userId: string; attended: boolean }[]) => {
    db.prepare("DELETE FROM session_log_attendance WHERE entry_id = ?").run(entryId);
    const insert = db.prepare(
      "INSERT INTO session_log_attendance (entry_id, user_id, attended, created_at) VALUES (?, ?, ?, ?)"
    );
    for (const row of rows) {
      insert.run(entryId, row.userId, row.attended ? 1 : 0, now);
    }
  });
  replace(clean);

  return listEntryAttendance(entryId);
}

/** A user's aggregate "shows up" signal -- see this file's and
 * types.ts's doc comments for why it's derived only from explicit
 * DM-recorded attendance, never from RSVP intent. rate is null (not 0)
 * when recorded is 0, matching this app's established unrated-not-zero
 * convention (e.g. lib/ratings.ts's getUserRatingSummary) -- a user
 * nobody has ever marked attendance for reads as "no data yet," not as
 * a 0% no-show rate. Deliberately excludes the DM role entirely --
 * attendance rows are never written against a campaign's own DM (see
 * setEntryAttendance/attendanceCandidates), so this naturally only ever
 * reflects player-side attendance. */
export function getAttendanceStats(userId: string): AttendanceStats {
  const row = db
    .prepare(
      `SELECT COUNT(*) as recorded, COALESCE(SUM(attended), 0) as attended
       FROM session_log_attendance WHERE user_id = ?`
    )
    .get(userId) as { recorded: number; attended: number };
  return {
    recorded: row.recorded,
    attended: row.attended,
    rate: row.recorded > 0 ? row.attended / row.recorded : null,
  };
}
