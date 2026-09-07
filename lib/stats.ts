import db from "./db";
import type { UserStats } from "./types";

export type { UserStats };

/** A user's own "year in review"-style stats — entirely derived from data
 * this app already has (no new tracking needed): campaigns DMed/played,
 * session log entries as a proxy for sessions actually run/played, distinct
 * and most-common systems, and the campaign with the most logged sessions.
 * Everything reads as zero/empty/null for a brand-new user rather than
 * erroring, so this can render unconditionally on a profile that has no
 * activity yet. */
export function getUserStats(userId: string): UserStats {
  const campaignsAsDm = (
    db.prepare("SELECT COUNT(*) as count FROM campaigns WHERE dm_id = ?").get(userId) as {
      count: number;
    }
  ).count;

  const campaignsAsPlayer = (
    db
      .prepare(
        "SELECT COUNT(DISTINCT campaign_id) as count FROM memberships WHERE user_id = ? AND status IN ('approved','left')"
      )
      .get(userId) as { count: number }
  ).count;

  const sessionsRun = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM session_log_entries sle
         JOIN campaigns c ON c.id = sle.campaign_id
         WHERE c.dm_id = ?`
      )
      .get(userId) as { count: number }
  ).count;

  const sessionsPlayed = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM session_log_entries sle
         WHERE sle.campaign_id IN (
           SELECT campaign_id FROM memberships WHERE user_id = ? AND status IN ('approved','left')
         )`
      )
      .get(userId) as { count: number }
  ).count;

  const charactersCreated = (
    db.prepare("SELECT COUNT(*) as count FROM characters WHERE user_id = ?").get(userId) as {
      count: number;
    }
  ).count;

  const systemRows = db
    .prepare(
      `SELECT system, COUNT(*) as count FROM (
         SELECT system FROM campaigns WHERE dm_id = ?
         UNION ALL
         SELECT c.system FROM campaigns c
         JOIN memberships m ON m.campaign_id = c.id
         WHERE m.user_id = ? AND m.status IN ('approved','left')
       )
       GROUP BY system
       ORDER BY count DESC, system ASC`
    )
    .all(userId, userId) as { system: string; count: number }[];

  const systemsPlayed = systemRows.map((r) => r.system);
  const mostPlayedSystem = systemRows.length > 0 ? systemRows[0].system : null;

  const longestRow = db
    .prepare(
      `SELECT c.id as id, c.title as title, COUNT(sle.id) as sessionCount
       FROM campaigns c
       LEFT JOIN session_log_entries sle ON sle.campaign_id = c.id
       WHERE c.dm_id = ?
          OR c.id IN (
            SELECT campaign_id FROM memberships WHERE user_id = ? AND status IN ('approved','left')
          )
       GROUP BY c.id
       ORDER BY sessionCount DESC, c.created_at ASC
       LIMIT 1`
    )
    .get(userId, userId) as { id: string; title: string; sessionCount: number } | undefined;

  const longestCampaign =
    longestRow && longestRow.sessionCount > 0
      ? { id: longestRow.id, title: longestRow.title, sessionCount: longestRow.sessionCount }
      : null;

  return {
    campaignsAsDm,
    campaignsAsPlayer,
    sessionsRun,
    sessionsPlayed,
    charactersCreated,
    systemsPlayed,
    mostPlayedSystem,
    longestCampaign,
  };
}
