"use client";

import { AVAILABILITY_DAYS, type AvailabilitySlot } from "@/lib/types";
import { formatHourLabel } from "@/lib/availabilityFormat";

const HOURS: number[] = Array.from({ length: 24 }, (_, i) => i);

function hasSlot(slots: AvailabilitySlot[], day: number, hour: number): boolean {
  return slots.some((s) => s.day === day && s.hour === hour);
}

/** A recurring weekly day x hour grid (backlog #27 phase 1 shipped this
 * as day x named-block; backlog #57 replaced the 4 named blocks with all
 * 24 specific clock hours -- see the doc comment on AvailabilitySlot in
 * lib/types.ts for the full reasoning, including the timezone decision).
 * In editable mode, clicking a cell toggles it and calls onChange with
 * the full updated slot list (the caller owns persistence -- this
 * component has no fetch/save logic of its own, matching
 * CharacterManager's controlled-form pattern). In read-only mode it just
 * highlights the given slots; app/players/[id]/page.tsx no longer uses
 * this for its own public display though (see that file's own comment)
 * -- a 168-cell grid is a lot to parse at a glance, so the public page
 * shows lib/availability.ts's plain-language summarizeAvailabilityByDay()
 * output instead. This component's read-only mode is kept for any future
 * caller that does want the visual grid (e.g. the owner reviewing their
 * own saved grid in a denser form than the edit view). */
export default function AvailabilityGrid({
  slots,
  onChange,
  editable = false,
}: {
  slots: AvailabilitySlot[];
  onChange?: (slots: AvailabilitySlot[]) => void;
  editable?: boolean;
}) {
  function toggle(day: number, hour: number) {
    if (!editable || !onChange) return;
    if (hasSlot(slots, day, hour)) {
      onChange(slots.filter((s) => !(s.day === day && s.hour === hour)));
    } else {
      onChange([...slots, { day, hour }]);
    }
  }

  if (!editable && slots.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-xs">
        <thead>
          <tr>
            <th className="p-1 text-left font-normal text-black/60 dark:text-white/60" />
            {HOURS.map((hour) => (
              <th key={hour} className="p-0.5 text-center font-normal text-black/60 dark:text-white/60">
                {hour % 3 === 0 ? formatHourLabel(hour) : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AVAILABILITY_DAYS.map((dayName, day) => (
            <tr key={dayName}>
              <td className="p-1 text-black/60 dark:text-white/60">{dayName.slice(0, 3)}</td>
              {HOURS.map((hour) => {
                const active = hasSlot(slots, day, hour);
                return (
                  <td key={hour} className="p-0.5 text-center">
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => toggle(day, hour)}
                      aria-pressed={active}
                      aria-label={`${dayName} ${formatHourLabel(hour)}-${formatHourLabel(hour + 1)}`}
                      className={`h-5 w-full rounded-sm ${
                        active
                          ? "bg-black dark:bg-white"
                          : "bg-black/10 dark:bg-white/10"
                      } ${editable ? "cursor-pointer" : "cursor-default"}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
