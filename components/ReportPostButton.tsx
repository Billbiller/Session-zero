"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Backlog #48: files a report against a thread or reply for a site
 * admin to review at /admin/boards. A small inline reason field rather
 * than a modal, matching DeletePostButton's own click-to-expand pattern
 * one level down in destructiveness -- reporting isn't destructive on
 * its own (only an admin's own delete is), so there's no "yes/no"
 * confirm step, just an optional reason before submitting. */
export default function ReportPostButton({
  endpoint,
  alreadyReported = false,
}: {
  endpoint: string;
  /** Server-computed initial state (lib/boards.ts's hasReportedThread/
   * hasReportedReply) -- mirrors FollowButton's initiallyFollowing prop. */
  alreadyReported?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(alreadyReported);
  const router = useRouter();

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setReported(true);
    setOpen(false);
    router.refresh();
  }

  if (reported) {
    return <span className="text-xs text-black/40 dark:text-white/40">Reported</span>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="whitespace-nowrap text-xs text-black/60 underline dark:text-white/60"
      >
        Report
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 text-xs">
      <div className="flex items-center gap-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          maxLength={500}
          className="rounded border border-black/10 px-2 py-0.5 dark:border-white/10 dark:bg-black"
        />
        <button
          disabled={submitting}
          onClick={submit}
          className="rounded bg-black px-2 py-0.5 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          Submit
        </button>
        <button onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
