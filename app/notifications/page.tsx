"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { Notification } from "@/lib/types";

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications?pageSize=50");
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // load() sets state only after its await resolves (an async microtask
    // continuation), and is also called from the "mark all read" button, so
    // it can't be inlined into this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markAllRead" }),
    });
    load();
  }

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    load();
  }

  if (loading) return <p className="text-sm">Loading...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <button onClick={markAllRead} className="text-sm underline">
          Mark all read
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((n) => (
          <li
            key={n.id}
            className={`rounded border p-3 text-sm dark:border-white/10 ${
              n.read ? "border-black/10 opacity-60" : "border-black/20"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p>{n.message}</p>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  {new Date(n.created_at).toLocaleString()}
                  {n.campaign_id && (
                    <>
                      {" "}
                      &middot;{" "}
                      <Link href={`/campaigns/${n.campaign_id}`} className="underline">
                        View campaign
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {!n.read && (
                <button onClick={() => markRead(n.id)} className="whitespace-nowrap text-xs underline">
                  Mark read
                </button>
              )}
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-black/60 dark:text-white/60">
            No notifications yet.
          </li>
        )}
      </ul>
    </div>
  );
}
