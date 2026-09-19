"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FriendshipViewerStatus } from "@/lib/types";

/** The friend-relationship counterpart to FollowButton, for a public
 * /players/[id] page (backlog #59). Unlike follow/unfollow (a plain
 * two-state toggle), a friend relationship has four viewer-relative
 * states (none/request_sent/request_received/friends -- see
 * FriendshipViewerStatus's own doc comment), so this renders a
 * different action, or pair of actions, per state rather than toggling
 * a single boolean. Every action (send/cancel/decline/accept/unfriend)
 * still maps onto just two HTTP verbs against /api/friends/[userId]
 * (POST to send, PATCH to accept, DELETE for the other three), matching
 * lib/friends.ts's own "collapse cancel/decline/unfriend into one
 * idempotent remove" shape. */
export default function FriendButton({
  userId,
  initialStatus,
}: {
  userId: string;
  initialStatus: FriendshipViewerStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function call(method: "POST" | "PATCH" | "DELETE") {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/friends/${userId}`, { method });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function sendRequest() {
    if (await call("POST")) setStatus("request_sent");
  }

  async function accept() {
    if (await call("PATCH")) setStatus("friends");
  }

  async function removeRelationship() {
    if (await call("DELETE")) setStatus("none");
  }

  if (status === "self") return null;

  const baseClass = "whitespace-nowrap rounded border border-black/10 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/10";
  const primaryClass = "whitespace-nowrap rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {status === "none" && (
          <button onClick={sendRequest} disabled={submitting} className={primaryClass}>
            Add friend
          </button>
        )}
        {status === "request_sent" && (
          <button onClick={removeRelationship} disabled={submitting} className={baseClass}>
            Request sent
          </button>
        )}
        {status === "request_received" && (
          <>
            <button onClick={accept} disabled={submitting} className={primaryClass}>
              Accept
            </button>
            <button onClick={removeRelationship} disabled={submitting} className={baseClass}>
              Decline
            </button>
          </>
        )}
        {status === "friends" && (
          <button onClick={removeRelationship} disabled={submitting} className={baseClass}>
            Friends
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
