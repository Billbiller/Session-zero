"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ScheduleStatus } from "@/lib/types";

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
  status,
}: {
  campaignId: string;
  isDm: boolean;
  nextSessionAt: string | null;
  status: ScheduleStatus;
}) {
  const [value, setValue] = useState(toLocalInputValue(nextSessionAt));
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
      body: JSON.stringify({ nextSessionAt: iso }),
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
    <div className="rounded border border-black/10 p-4 dark:border-white/10">
      <h2 className="mb-2 font-medium">Next session</h2>
      <p className="mb-2 text-sm">
        Status: <span className="font-medium">{STATUS_LABEL[status]}</span>
        {nextSessionAt && (
          <>
            {" "}
            &middot; {new Date(nextSessionAt).toLocaleString()}
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
              onClick={() => setValue("")}
              className="underline"
            >
              Clear
            </button>
          )}
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
