import db from "./db";
import { AVAILABILITY_BLOCKS, type AvailabilityBlock, type AvailabilitySlot } from "./types";

export class AvailabilityError extends Error {}

function isKnownBlock(value: string): value is AvailabilityBlock {
  return (AVAILABILITY_BLOCKS as readonly string[]).includes(value);
}

/** A user's recurring weekly availability grid (backlog #27, phase 1) --
 * just the set of day/block cells they've marked as generally free.
 * Order is day-then-block, matching the grid's reading order; an
 * unrecognized day/block combination is impossible to produce through
 * setAvailabilitySlots, so no defensive filtering is needed on read. */
export function getAvailabilitySlots(userId: string): AvailabilitySlot[] {
  return db
    .prepare(
      `SELECT day_of_week as day, block FROM availability_slots
       WHERE user_id = ?
       ORDER BY day_of_week ASC,
         CASE block WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 WHEN 'evening' THEN 2 ELSE 3 END ASC`
    )
    .all(userId) as AvailabilitySlot[];
}

/** Replaces a user's entire availability grid with the given set of slots
 * (full-replace, not a merge -- mirrors how the UI always submits the
 * complete current grid state rather than individual toggles). Validates
 * every slot before writing anything, and de-duplicates repeated
 * day/block pairs rather than erroring on them. */
export function setAvailabilitySlots(userId: string, slots: AvailabilitySlot[]): AvailabilitySlot[] {
  const seen = new Set<string>();
  const clean: AvailabilitySlot[] = [];
  for (const slot of slots) {
    if (!Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6) {
      throw new AvailabilityError("Day must be an integer between 0 and 6.");
    }
    if (typeof slot.block !== "string" || !isKnownBlock(slot.block)) {
      throw new AvailabilityError(`Unrecognized time-of-day block: ${slot.block}`);
    }
    const key = `${slot.day}-${slot.block}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ day: slot.day, block: slot.block });
  }

  const replace = db.transaction((rows: AvailabilitySlot[]) => {
    db.prepare("DELETE FROM availability_slots WHERE user_id = ?").run(userId);
    const insert = db.prepare(
      "INSERT INTO availability_slots (user_id, day_of_week, block) VALUES (?, ?, ?)"
    );
    for (const row of rows) {
      insert.run(userId, row.day, row.block);
    }
  });
  replace(clean);

  return getAvailabilitySlots(userId);
}
