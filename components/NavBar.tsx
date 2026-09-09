"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function NavBar({
  user,
}: {
  user: { displayName: string; isAdmin?: boolean } | null;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadTableChatCount, setUnreadTableChatCount] = useState(0);
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

  // Dedicated unread-direct-message badge (backlog #44), kept entirely
  // separate from the general notifications badge above: it's backed by
  // messages.read (via lib/messageEvents.ts + /api/messages/stream) rather
  // than the notifications table, mirroring the exact SSE-with-polling-
  // fallback shape of the effect above one level down. Before this, a new
  // DM only ever bumped the undifferentiated "Notifications" count — the
  // "Messages" link itself had no unread indicator of its own, unlike
  // every other unread surface in this app.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | undefined;

    async function pollOnce() {
      const res = await fetch("/api/messages");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (!cancelled) {
        const conversations = (data.conversations ?? []) as { unreadCount: number }[];
        const total = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
        setUnreadMessageCount(total);
      }
    }

    function startPolling() {
      if (pollInterval || cancelled) return;
      pollOnce();
      pollInterval = setInterval(pollOnce, 15000);
    }

    if (typeof EventSource === "undefined") {
      startPolling();
      return () => {
        cancelled = true;
        if (pollInterval) clearInterval(pollInterval);
      };
    }

    const source = new EventSource("/api/messages/stream");

    source.addEventListener("unread", (event) => {
      if (cancelled) return;
      try {
        const data = JSON.parse((event as MessageEvent).data);
        if (typeof data.unreadCount === "number") setUnreadMessageCount(data.unreadCount);
      } catch {
        // malformed event — ignore, the next one (or the polling fallback) will catch up
      }
    });

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

  // Backlog #45: dedicated unread-table-chat badge, mirroring the
  // unreadMessageCount effect immediately above one more level down --
  // backed by campaign_messages/campaign_message_reads (via
  // lib/campaignChatEvents.ts + /api/campaigns/chat/stream) rather than
  // messages.read or notifications.read, so it's a third, independent
  // counter with the same SSE-with-15s-polling-fallback shape. There's no
  // dedicated "my tables" top-level nav link to hang this on the way
  // Messages/Notifications each have their own -- it rides the existing
  // profile link instead, since "My campaigns" (with its own per-campaign
  // breakdown -- see app/profile/page.tsx) already lives at /profile.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | undefined;

    async function pollOnce() {
      const res = await fetch("/api/profile");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (!cancelled) {
        const counts = (data.unreadCampaignChatCounts ?? {}) as Record<string, number>;
        const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
        setUnreadTableChatCount(total);
      }
    }

    function startPolling() {
      if (pollInterval || cancelled) return;
      pollOnce();
      pollInterval = setInterval(pollOnce, 15000);
    }

    if (typeof EventSource === "undefined") {
      startPolling();
      return () => {
        cancelled = true;
        if (pollInterval) clearInterval(pollInterval);
      };
    }

    const source = new EventSource("/api/campaigns/chat/stream");

    source.addEventListener("unread", (event) => {
      if (cancelled) return;
      try {
        const data = JSON.parse((event as MessageEvent).data);
        if (typeof data.unreadCount === "number") setUnreadTableChatCount(data.unreadCount);
      } catch {
        // malformed event — ignore, the next one (or the polling fallback) will catch up
      }
    });

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
          <Link href="/systems">Systems</Link>
          <Link href="/subs">Find a sub</Link>
          <Link href="/boards">Boards</Link>
          {user && (
            <>
              <Link href="/campaigns/new">New campaign</Link>
              <Link href="/feed">Feed</Link>
              <Link href="/messages" className="relative">
                Messages
                {unreadMessageCount > 0 && (
                  <span
                    className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-medium text-white"
                    aria-label={`${unreadMessageCount} unread`}
                  >
                    {unreadMessageCount}
                  </span>
                )}
              </Link>
              <Link href="/notifications" className="relative">
                Notifications
                {unreadCount > 0 && (
                  <span
                    className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-medium text-white"
                    aria-label={`${unreadCount} unread`}
                  >
                    {unreadCount}
                  </span>
                )}
              </Link>
              <Link href="/settings/notifications">Settings</Link>
              {user.isAdmin && <Link href="/admin/boards">Admin</Link>}
              <Link href="/profile" className="relative text-black/60 dark:text-white/60">
                {user.displayName}
                {unreadTableChatCount > 0 && (
                  <span
                    className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-medium text-white"
                    title="Unread table chat messages across your campaigns"
                    aria-label={`${unreadTableChatCount} unread table chat messages`}
                  >
                    {unreadTableChatCount}
                  </span>
                )}
              </Link>
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
