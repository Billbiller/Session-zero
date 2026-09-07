"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** A small, reusable two-click confirm delete action, used by both the
 * board thread and board reply UIs (backlog #37) for the "author can
 * delete their own post" self-moderation affordance -- matches
 * JoinLeaveControls' own click-to-confirm pattern for a destructive
 * action, rather than a browser window.confirm() dialog. */
export default function DeletePostButton({
  endpoint,
  redirectTo,
  confirmLabel = "Delete this?",
}: {
  endpoint: string;
  /** If set, navigates here after a successful delete (e.g. a deleted
   * thread sends the viewer back to the board list, since the thread page
   * itself no longer exists). Omit to just router.refresh() in place
   * (e.g. deleting one reply among others still on the same page). */
  redirectTo?: string;
  confirmLabel?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(endpoint, { method: "DELETE" });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    if (redirectTo) {
      router.push(redirectTo);
    } else {
      router.refresh();
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="whitespace-nowrap text-xs text-red-600 underline"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-black/60 dark:text-white/60">{confirmLabel}</span>
        <button
          disabled={submitting}
          onClick={handleDelete}
          className="rounded bg-red-600 px-2 py-0.5 text-white disabled:opacity-50"
        >
          Yes, delete
        </button>
        <button onClick={() => setConfirming(false)} className="underline">
          Cancel
        </button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
