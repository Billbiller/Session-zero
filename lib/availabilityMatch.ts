import { type AvailabilitySlot } from "./types";

/** Pure, DB-free helpers for comparing a campaign's scheduled session time
 * against a viewer's saved recurring weekly availability grid (backlog
 * #27 phase 2 -- the "search/matching layer" phase 1 explicitly deferred,
 * see the dated session log entry). Split out from lib/availability.ts
 * for the same "use client" / better-sqlite3 reason as
 * lib/availabilityFormat.ts: this needs to run inside a "use client"
 * component (DiscoverDeck.tsx), in the *browser*, after mount -- not on
 * the server (see DiscoverDeck's own comment on why).
 *
 * Why this is meaningful despite there being no stored per-user timezone
 * field anywhere in this app (a deliberate scope cut from phase 1, see
 * AvailabilitySlot's own doc comment in lib/types.ts): a campaign's
 * `next_session_at` is a real absolute UTC instant (the DM picked it via
 * a browser `datetime-local` input -- see ScheduleForm.tsx's
 * toLocalInputValue/save), while a viewer's availability grid is a set of
 * hours in *their own* local time. Converting that same instant to "day
 * of week + hour" using `new Date(iso)` *in the viewer's own browser*
 * naturally lands in the viewer's own local time too -- the same
 * implicit, no-stored-offset mechanism ScheduleForm and every
 * `toLocaleString()` call in this app already rely on. So this
 * comparison is exactly as timezone-correct as the rest of the app's
 * date handling, no more and no less: correct for the person looking at
 * their own screen, not a claim about the DM's or any other viewer's
 * timezone. */

/** Convert a JS `Date.getDay()` value (0 = Sunday) to this app's own
 * AVAILABILITY_DAYS index (0 = Monday, 6 = Sunday -- see that constant's
 * own doc comment in lib/types.ts for why the app uses this order). */
export function appDayFromJsDay(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export interface LocalDayHour {
  /** AVAILABILITY_DAYS index, 0-6. */
  day: number;
  /** 0-23. */
  hour: number;
}

/** The (day, hour) a given ISO instant falls on in whatever timezone the
 * *calling code* is running in. This function isn't timezone-aware in any
 * special way beyond wrapping `new Date` -- it's the caller (DiscoverDeck,
 * only after mount) that makes the result the viewer's own local time. */
export function localDayAndHour(iso: string): LocalDayHour {
  const d = new Date(iso);
  return { day: appDayFromJsDay(d.getDay()), hour: d.getHours() };
}

/** Does a campaign's next scheduled session land on an hour the viewer has
 * marked free in their own availability grid?
 *
 * Returns `null` -- "unknown," deliberately distinct from `false` -- when
 * there's nothing to compare: an unscheduled campaign (`nextSessionAt` is
 * null) or a viewer with no saved grid at all. Callers use `null` to mean
 * "don't show a match indicator," not "doesn't fit." */
export function matchesAvailability(
  nextSessionAt: string | null,
  grid: AvailabilitySlot[]
): boolean | null {
  if (!nextSessionAt || grid.length === 0) return null;
  const { day, hour } = localDayAndHour(nextSessionAt);
  return grid.some((slot) => slot.day === day && slot.hour === hour);
}
