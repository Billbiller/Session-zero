"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Membership } from "@/lib/types";

type RequestRow = Membership & { user: { display_name: string } | null };

export default function RequestsPanel({
  campaignId,
  requests,
}: {
  campaignId: string;
  requests: RequestRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const router = useRouter();

  async function resolve(membershipId: string, action: "approve" | "decline") {
    setSubmittingId(membershipId);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/requests/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setSubmittingId(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  if (requests.length === 0) {
    return (
      <div className="rounded border border-black/10 p-4 dark:border-white/10">
        <h2 className="font-medium">Pending requests</h2>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">No pending requests.</p>
      </div>
    );
  }

  return (
    <div className="rounded border border-black/10 p-4 dark:border-white/10">
      <h2 className="mb-2 font-medium">Pending requests</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-2">
        {requests.map((r) => (
          <li key={r.id} className="flex items-center justify-between text-sm">
            <span>{r.user?.display_name ?? "Unknown player"}</span>
            <span className="flex gap-2">
              <button
                disabled={submittingId === r.id}
                onClick={() => resolve(r.id, "approve")}
                className="rounded bg-black px-2 py-1 text-white disabled:opacity-50 dark:bg-white dark:text-black"
              >
                Approve
              </button>
              <button
                disabled={submittingId === r.id}
                onClick={() => resolve(r.id, "decline")}
                className="rounded border border-black/20 px-2 py-1 dark:border-white/20"
              >
                Decline
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
