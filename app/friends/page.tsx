"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface FriendEntry {
  id: string;
  display_name: string;
  since: string;
}

interface PendingEntry {
  id: string;
  display_name: string;
  requested_at: string;
}

/** Backlog #59: friends list + incoming/outgoing friend requests. A
 * single client page (matching /notifications) rather than three
 * separate routes -- all three lists come back from one GET
 * /api/friends call, and accept/decline/cancel/unfriend all live behind
 * the same /api/friends/[userId] endpoint FriendButton itself calls on
 * /players/[id], so actions taken here reuse those same two fetches
 * rather than a page-specific API. */
export default function FriendsPage() {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [pendingReceived, setPendingReceived] = useState<PendingEntry[]>([]);
  const [pendingSent, setPendingSent] = useState<PendingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/friends");
    if (res.ok) {
      const data = await res.json();
      setFriends(data.friends ?? []);
      setPendingReceived(data.pendingReceived ?? []);
      setPendingSent(data.pendingSent ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function act(userId: string, method: "PATCH" | "DELETE") {
    setBusyId(userId);
    setError(null);
    const res = await fetch(`/api/friends/${userId}`, { method });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    load();
  }

  if (loading) return <p className="text-sm">Loading...</p>;

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold">Friends</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">
          Requests ({pendingReceived.length})
        </h2>
        {pendingReceived.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No pending requests.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pendingReceived.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded border border-black/10 p-3 text-sm dark:border-white/10"
              >
                <Link href={`/players/${p.id}`} className="underline">
                  {p.display_name}
                </Link>
                <div className="flex gap-2">
                  <button
                    onClick={() => act(p.id, "PATCH")}
                    disabled={busyId === p.id}
                    className="whitespace-nowrap rounded bg-black px-3 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-black"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => act(p.id, "DELETE")}
                    disabled={busyId === p.id}
                    className="whitespace-nowrap rounded border border-black/10 px-3 py-1 text-xs disabled:opacity-50 dark:border-white/10"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Sent ({pendingSent.length})</h2>
        {pendingSent.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No outgoing requests.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pendingSent.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded border border-black/10 p-3 text-sm dark:border-white/10"
              >
                <Link href={`/players/${p.id}`} className="underline">
                  {p.display_name}
                </Link>
                <button
                  onClick={() => act(p.id, "DELETE")}
                  disabled={busyId === p.id}
                  className="whitespace-nowrap rounded border border-black/10 px-3 py-1 text-xs disabled:opacity-50 dark:border-white/10"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Friends ({friends.length})</h2>
        {friends.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            No friends yet -- send a request from someone&apos;s profile.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {friends.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 rounded border border-black/10 p-3 text-sm dark:border-white/10"
              >
                <Link href={`/players/${f.id}`} className="underline">
                  {f.display_name}
                </Link>
                <button
                  onClick={() => act(f.id, "DELETE")}
                  disabled={busyId === f.id}
                  className="whitespace-nowrap rounded border border-black/10 px-3 py-1 text-xs disabled:opacity-50 dark:border-white/10"
                >
                  Unfriend
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
