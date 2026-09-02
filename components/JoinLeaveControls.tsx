"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function JoinLeaveControls({
  campaignId,
  signedIn,
  isDm,
  membershipStatus,
  acceptingRequests,
  cancelled,
}: {
  campaignId: string;
  signedIn: boolean;
  isDm: boolean;
  membershipStatus: "pending" | "approved" | "declined" | "left" | null;
  acceptingRequests: boolean;
  cancelled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const router = useRouter();

  if (!signedIn) {
    return (
      <p className="text-sm">
        <Link href="/signin" className="underline">
          Sign in
        </Link>{" "}
        to request to join this campaign.
      </p>
    );
  }

  if (isDm) return null;
  if (cancelled) return <p className="text-sm text-black/60 dark:text-white/60">This campaign is cancelled.</p>;

  async function act(path: string) {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/${path}`, { method: "POST" });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  if (membershipStatus === "pending") {
    return <p className="text-sm">Your request to join is pending.</p>;
  }

  if (membershipStatus === "approved") {
    return (
      <div className="flex flex-col gap-2">
        {!confirmingLeave ? (
          <button
            onClick={() => setConfirmingLeave(true)}
            className="w-fit rounded border border-red-600 px-3 py-1.5 text-sm text-red-600"
          >
            Leave campaign
          </button>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span>Are you sure you want to leave?</span>
            <button
              disabled={submitting}
              onClick={() => act("leave")}
              className="rounded bg-red-600 px-3 py-1 text-white disabled:opacity-50"
            >
              Yes, leave
            </button>
            <button onClick={() => setConfirmingLeave(false)} className="underline">
              Cancel
            </button>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  // membershipStatus is null, "declined", or "left" -> can request to join again
  if (!acceptingRequests) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        This campaign isn&apos;t accepting requests right now.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        disabled={submitting}
        onClick={() => act("join")}
        className="w-fit rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {submitting ? "Requesting..." : "Request to join"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
