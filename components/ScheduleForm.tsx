"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RECURRENCES, RECURRENCE_LABELS, type Recurrence, type ScheduleStatus } from "@/lib/types";
import Section from "@/components/Section";

const STATUS_LABEL: Record<ScheduleStatus, string> = {
  unscheduled: "No session scheduled yet",
  upcoming: "Upcoming",
  "past-due": "Past due",
};

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export default function ScheduleForm({
  campaignId,
  isDm,
  nextSessionAt,
  recurrence,
  status,
}: {
  campaignId: string;
  isDm: boolean;
  nextSessionAt: string | null;
  /** Backlog #70: edited together with nextSessionAt below -- see
   * lib/types.ts's Campaign.recurrence doc comment for why these two
   * fields are always set/cleared as a pair. */
  recurrence: Recurrence | null;
  status: ScheduleStatus;
}) {
  const [value, setValue] = useState(toLocalInputValue(nextSessionAt));
  const [recurrenceValue, setRecurrenceValue] = useState<Recurrence | "">(recurrence ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const iso = value ? new Date(value).toISOString() : null;
    const res = await fetch(`/api/campaigns/${campaignId}/schedule`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // Recurrence only means anything alongside a date -- clearing the
      // date always clears recurrence too, same as lib/schedule.ts's
      // updateSchedule itself enforces server-side.
      body: JSON.stringify({
        nextSessionAt: iso,
        recurrence: iso ? recurrenceValue || null : null,
      }),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <Section>
      <h2 className="mb-2 font-medium">Next session</h2>
      <p className="mb-2 text-sm">
        Status: <span className="font-medium">{STATUS_LABEL[status]}</span>
        {nextSessionAt && (
          <>
            {" "}
            &middot; {new Date(nextSessionAt).toLocaleString()}
            {recurrence && <> &middot; {RECURRENCE_LABELS[recurrence]}</>}
            {" "}
            &middot;{" "}
            <a href={`/api/campaigns/${campaignId}/calendar`} className="underline">
              Add to calendar (.ics)
            </a>
          </>
        )}
      </p>
      {isDm && (
        <form onSubmit={save} className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            Date &amp; time
            <input
              type="datetime-local"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1">
            Repeats
            <select
              value={recurrenceValue}
              onChange={(e) => setRecurrenceValue(e.target.value as Recurrence | "")}
              disabled={!value}
              className="rounded border border-black/20 px-3 py-1.5 disabled:opacity-50 dark:border-white/20 dark:bg-transparent"
            >
              <option value="">One-time</option>
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>
                  {RECURRENCE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-black px-3 py-1.5 text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Save
          </button>
          {value && (
            <button
              type="button"
              onClick={() => {
                setValue("");
                setRecurrenceValue("");
              }}
              className="underline"
            >
              Clear
            </button>
          )}
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Section>
  );
}
