"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function NavBar({
  user,
}: {
  user: { displayName: string } | null;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | undefined;

    async function pollOnce() {
      const res = await fetch("/api/notifications?pageSize=1");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (!cancelled) setUnreadCount(data.unreadCount ?? 0);
    }

    function startPolling() {
      if (pollInterval || cancelled) return;
      pollOnce();
      pollInterval = setInterval(pollOnce, 15000);
    }

    // EventSource isn't available during SSR and may be missing/blocked in
    // some environments (older browsers, some proxies) — polling is the
    // fallback in both cases, not just on a live connection dropping.
    if (typeof EventSource === "undefined") {
      startPolling();
      return () => {
        cancelled = true;
        if (pollInterval) clearInterval(pollInterval);
      };
    }

    const source = new EventSource("/api/notifications/stream");

    source.addEventListener("unread", (event) => {
      if (cancelled) return;
      try {
        const data = JSON.parse((event as MessageEvent).data);
        if (typeof data.unreadCount === "number") setUnreadCount(data.unreadCount);
      } catch {
        // malformed event — ignore, the next one (or the polling fallback) will catch up
      }
    });

    // No reconnect/backoff logic here on purpose: EventSource already
    // retries the connection on its own, but if it keeps failing (e.g. a
    // proxy that strips text/event-stream) we drop to polling permanently
    // for this mount rather than flapping between the two.
    source.onerror = () => {
      source.close();
      startPolling();
    };

    return () => {
      cancelled = true;
      source.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [user]);

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/campaigns" className="font-semibold">
          Session Zero
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/campaigns">Browse</Link>
          {user && (
            <>
              <Link href="/campaigns/new">New campaign</Link>
              <Link href="/notifications" className="relative">
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-medium text-white">
                    {unreadCount}
                  </span>
                )}
              </Link>
              <Link href="/settings/notifications">Settings</Link>
              <span className="text-black/60 dark:text-white/60">
                {user.displayName}
              </span>
              <button onClick={handleSignOut} className="underline">
                Sign out
              </button>
            </>
          )}
          {!user && <Link href="/signin">Sign in</Link>}
        </nav>
      </div>
    </header>
  );
}
