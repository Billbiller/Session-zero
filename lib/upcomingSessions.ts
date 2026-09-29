import type { Recurrence } from "./types";

/**
 * Backlog #70 (competitive research vs. StartPlaying.games): pure,
 * DB-free helpers for projecting a short list of upcoming session dates
 * from a campaign's single `next_session_at` instant plus an optional
 * weekly/biweekly `recurrence` -- same "use client"-safe split as
 * lib/availabilityFormat.ts/lib/availabilityMatch.ts, so a client
 * component can import this without pulling in lib/db.ts's
 * better-sqlite3. Deliberately simple: no real recurrence-rule engine, no
 * exceptions/skipped dates, just "same day/time, every N days" -- matching
 * Campaign.recurrence's own doc comment in lib/types.ts.
 */

/** How many dates to project forward by default -- enough for a
 * prospective viewer to judge whether the cadence fits their calendar
 * (StartPlaying shows 10+; this app has no "session count" concept to
 * cap against yet) without needing pagination. */
export const DEFAULT_PROJECTED_SESSION_COUNT = 6;

const RECURRENCE_INTERVAL_DAYS: Record<Recurrence, number> = {
  weekly: 7,
  biweekly: 14,
};

/**
 * Projects the upcoming session dates for a campaign.
 *
 * - No `nextSessionAt` (unscheduled): returns an empty list -- there's
 *   nothing to preview.
 * - `nextSessionAt` set but no `recurrence` (the historical default, a
 *   one-off/irregular schedule): returns just that one date, matching
 *   what a viewer could already see before this feature existed.
 * - Both set: returns up to `count` dates starting at `nextSessionAt`,
 *   each spaced `recurrence`'s interval apart, as UTC ISO instants --
 *   formatting/localizing these is the caller's job (e.g.
 *   `Date#toLocaleString()`, the same convention every other date in
 *   this app already follows -- see DiscoverDeck.tsx's own doc comment
 *   on that tradeoff).
 *
 * `count` includes `nextSessionAt` itself. An unparseable `nextSessionAt`
 * or a non-positive `count` degrades gracefully rather than throwing,
 * since this is a display helper, not a validator -- lib/schedule.ts's
 * updateSchedule already validates both fields on write.
 */
export function projectUpcomingSessions(
  nextSessionAt: string | null,
  recurrence: Recurrence | null,
  count: number = DEFAULT_PROJECTED_SESSION_COUNT
): string[] {
  if (!nextSessionAt) return [];
  const start = new Date(nextSessionAt);
  if (Number.isNaN(start.getTime())) return [];
  if (!recurrence || !Number.isInteger(count) || count < 1) {
    return [nextSessionAt];
  }
  const intervalMs = RECURRENCE_INTERVAL_DAYS[recurrence] * 24 * 60 * 60 * 1000;
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(new Date(start.getTime() + i * intervalMs).toISOString());
  }
  return dates;
}
