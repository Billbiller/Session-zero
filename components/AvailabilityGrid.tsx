"use client";

import { AVAILABILITY_DAYS, AVAILABILITY_BLOCKS, type AvailabilitySlot } from "@/lib/types";

const BLOCK_LABELS: Record<(typeof AVAILABILITY_BLOCKS)[number], string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

function hasSlot(slots: AvailabilitySlot[], day: number, block: string): boolean {
  return slots.some((s) => s.day === day && s.block === block);
}

/** A recurring weekly day x time-of-day grid (backlog #27, phase 1). In
 * editable mode, clicking a cell toggles it and calls onChange with the
 * full updated slot list (the caller owns persistence -- this component
 * has no fetch/save logic of its own, matching CharacterManager's
 * controlled-form pattern). In read-only mode it just highlights the
 * given slots, used on a public player profile. */
export default function AvailabilityGrid({
  slots,
  onChange,
  editable = false,
}: {
  slots: AvailabilitySlot[];
  onChange?: (slots: AvailabilitySlot[]) => void;
  editable?: boolean;
}) {
  function toggle(day: number, block: (typeof AVAILABILITY_BLOCKS)[number]) {
    if (!editable || !onChange) return;
    if (hasSlot(slots, day, block)) {
      onChange(slots.filter((s) => !(s.day === day && s.block === block)));
    } else {
      onChange([...slots, { day, block }]);
    }
  }

  if (!editable && slots.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-xs">
        <thead>
          <tr>
            <th className="p-1 text-left font-normal text-black/60 dark:text-white/60" />
            {AVAILABILITY_DAYS.map((day) => (
              <th key={day} className="p-1 text-center font-medium">
                {day.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AVAILABILITY_BLOCKS.map((block) => (
            <tr key={block}>
              <td className="p-1 text-black/60 dark:text-white/60">{BLOCK_LABELS[block]}</td>
              {AVAILABILITY_DAYS.map((_, day) => {
                const active = hasSlot(slots, day, block);
                return (
                  <td key={day} className="p-1 text-center">
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => toggle(day, block)}
                      aria-pressed={active}
                      aria-label={`${AVAILABILITY_DAYS[day]} ${BLOCK_LABELS[block]}`}
                      className={`h-6 w-full rounded ${
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
