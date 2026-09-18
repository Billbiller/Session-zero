import db from "./db";
import type { AvailabilitySlot } from "./types";
import { MIN_HOUR, MAX_HOUR } from "./availabilityFormat";

export {
  formatHourLabel,
  summarizeAvailabilityByDay,
  type DayAvailabilitySummary,
} from "./availabilityFormat";

export class AvailabilityError extends Error {}

/** A user's recurring weekly availability grid (backlog #27, phase 1;
 * hour granularity added by backlog #57 -- see the doc comment on
 * AvailabilitySlot in lib/types.ts) -- the set of specific hour cells
 * they've marked as generally free. Order is day-then-hour, matching the
 * grid's reading order; an unrecognized day/hour combination is
 * impossible to produce through setAvailabilitySlots, so no defensive
 * filtering is needed on read. */
export function getAvailabilitySlots(userId: string): AvailabilitySlot[] {
  return db
    .prepare(
      `SELECT day_of_week as day, hour FROM availability_hours
       WHERE user_id = ?
       ORDER BY day_of_week ASC, hour ASC`
    )
    .all(userId) as AvailabilitySlot[];
}

/** Replaces a user's entire availability grid with the given set of slots
 * (full-replace, not a merge -- mirrors how the UI always submits the
 * complete current grid state rather than individual toggles). Validates
 * every slot before writing anything, and de-duplicates repeated
 * day/hour pairs rather than erroring on them. */
export function setAvailabilitySlots(userId: string, slots: AvailabilitySlot[]): AvailabilitySlot[] {
  const seen = new Set<string>();
  const clean: AvailabilitySlot[] = [];
  for (const slot of slots) {
    if (!Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6) {
      throw new AvailabilityError("Day must be an integer between 0 and 6.");
    }
    if (!Number.isInteger(slot.hour) || slot.hour < MIN_HOUR || slot.hour > MAX_HOUR) {
      throw new AvailabilityError(`Hour must be an integer between ${MIN_HOUR} and ${MAX_HOUR}.`);
    }
    const key = `${slot.day}-${slot.hour}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ day: slot.day, hour: slot.hour });
  }

  const replace = db.transaction((rows: AvailabilitySlot[]) => {
    db.prepare("DELETE FROM availability_hours WHERE user_id = ?").run(userId);
    const insert = db.prepare(
      "INSERT INTO availability_hours (user_id, day_of_week, hour) VALUES (?, ?, ?)"
    );
    for (const row of rows) {
      insert.run(userId, row.day, row.hour);
    }
  });
  replace(clean);

  return getAvailabilitySlots(userId);
}
