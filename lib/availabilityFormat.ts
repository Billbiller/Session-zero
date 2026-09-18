import { AVAILABILITY_DAYS, type AvailabilitySlot } from "./types";

/** Pure, DB-free formatting helpers for the availability grid (backlog
 * #57) -- split out from lib/availability.ts specifically so a "use
 * client" component (AvailabilityGrid.tsx) can import formatHourLabel
 * for its column headers/aria-labels without pulling in lib/availability.ts's
 * `import db from "./db"`, which transitively drags in better-sqlite3 (a
 * native Node addon that can't bundle for the browser) -- the exact
 * client/server split backlog #55/#56 already had to make for
 * lib/systems.ts vs. lib/types.ts's curatedSystemMatches(). Re-exported
 * from lib/availability.ts too, so a server-side caller can import
 * everything availability-related from one place. */

const MIN_HOUR = 0;
const MAX_HOUR = 23;

export { MIN_HOUR, MAX_HOUR };

/** "6pm" / "12am" / "11pm" -- a 12-hour clock label for a given hour of
 * day. `hour` is taken mod 24 first so a range's exclusive end (which can
 * legitimately be 24, meaning "through midnight") formats as "12am"
 * rather than throwing or producing "24:00". */
export function formatHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export interface DayAvailabilitySummary {
  /** 0-6, see AVAILABILITY_DAYS. */
  day: number;
  dayName: string;
  /** Each contiguous run of free hours on this day, formatted as e.g.
   * "6pm-9pm" -- both bounds always carry their own am/pm suffix (rather
   * than the backlog's own shorthand example "6-9pm") to stay unambiguous
   * across the noon/midnight boundary (e.g. "11am-1pm"). */
  ranges: string[];
}

/** Collapses a flat list of (day, hour) cells into one readable range per
 * contiguous run, grouped by day -- e.g. hours 18/19/20 on Tuesday
 * (6pm/7pm/8pm, each meaning "free for that one hour") become a single
 * "6pm-9pm" range rather than three separate hour labels. Only days that
 * have at least one marked hour are included, in AVAILABILITY_DAYS order
 * (not necessarily the order `slots` arrived in). */
export function summarizeAvailabilityByDay(slots: AvailabilitySlot[]): DayAvailabilitySummary[] {
  const byDay = new Map<number, number[]>();
  for (const slot of slots) {
    const hours = byDay.get(slot.day) ?? [];
    hours.push(slot.hour);
    byDay.set(slot.day, hours);
  }

  const summaries: DayAvailabilitySummary[] = [];
  for (let day = 0; day < AVAILABILITY_DAYS.length; day++) {
    const hours = byDay.get(day);
    if (!hours || hours.length === 0) continue;
    const sorted = [...new Set(hours)].sort((a, b) => a - b);

    const ranges: string[] = [];
    let rangeStart = sorted[0];
    let rangeEnd = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      const hour = sorted[i];
      if (hour === rangeEnd + 1) {
        rangeEnd = hour;
        continue;
      }
      ranges.push(`${formatHourLabel(rangeStart)}-${formatHourLabel(rangeEnd + 1)}`);
      if (i < sorted.length) {
        rangeStart = hour;
        rangeEnd = hour;
      }
    }

    summaries.push({ day, dayName: AVAILABILITY_DAYS[day], ranges });
  }
  return summaries;
}
