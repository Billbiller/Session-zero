"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function NavBar({
  user,
}: {
  user: { displayName: string; isAdmin?: boolean } | null;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadTableChatCount, setUnreadTableChatCount] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

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

  const badge = (n: number, label: string, title?: string) =>
    n > 0 ? (
      <span
        className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[0.7rem] font-semibold leading-5 text-white"
        title={title}
        aria-label={label}
      >
        {n}
      </span>
    ) : null;

  const navLink = (href: string, label: React.ReactNode) => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
    return (
      <Link
        href={href}
        onClick={() => setMenuOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`inline-flex items-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          active
            ? "bg-brand-soft text-brand-strong"
            : "text-black/65 hover:bg-black/5 hover:text-black dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-background/80 backdrop-blur-lg dark:border-white/10">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5">
        <Link href="/" className="mr-2 flex items-center gap-2 font-bold tracking-tight">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="M12 2 21 7.5v9L12 22 3 16.5v-9L12 2Z M12 2v9M12 11 3 7.5M12 11l9-3.5M12 11v11"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span>Session Zero</span>
        </Link>

        <button
          type="button"
          className="ml-auto grid h-9 w-9 place-items-center rounded-lg border border-black/15 lg:hidden dark:border-white/15"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
            {menuOpen ? (
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            )}
          </svg>
        </button>

        <nav
          id="site-nav"
          className={`${
            menuOpen ? "flex" : "hidden"
          } absolute inset-x-0 top-full flex-col gap-1 border-b border-black/10 bg-background p-3 shadow-lg lg:static lg:ml-2 lg:flex lg:flex-1 lg:flex-row lg:items-center lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none dark:border-white/10`}
        >
          <div className="flex flex-col gap-0.5 lg:flex-row lg:items-center">
            {navLink("/campaigns", "Browse")}
            {navLink("/systems", "Systems")}
            {navLink("/dice", "Dice")}
            {navLink("/subs", "Find a sub")}
            {navLink("/boards", "Boards")}
          </div>

          <div className="mt-2 flex flex-col gap-0.5 border-t border-black/10 pt-2 lg:ml-auto lg:mt-0 lg:flex-row lg:items-center lg:gap-1 lg:border-0 lg:pt-0 dark:border-white/10">
            {user ? (
              <>
                <Link
                  href="/campaigns/new"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-black px-3.5 py-1.5 text-sm font-semibold text-white lg:mr-1"
                >
                  + New campaign
                </Link>
                {navLink("/feed", "Feed")}
                {navLink("/friends", "Friends")}
                {navLink("/messages", <>Messages{badge(unreadMessageCount, `${unreadMessageCount} unread`)}</>)}
                {navLink(
                  "/notifications",
                  <>Alerts{badge(unreadCount, `${unreadCount} unread notifications`)}</>,
                )}
                <details className="group relative lg:ml-1">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10 [&::-webkit-details-marker]:hidden">
                    <span
                      aria-hidden="true"
                      className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-strong"
                    >
                      {user.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="max-w-[8rem] truncate">{user.displayName}</span>
                    {badge(
                      unreadTableChatCount,
                      `${unreadTableChatCount} unread table chat messages`,
                      "Unread table chat messages across your campaigns",
                    )}
                    <svg viewBox="0 0 20 20" className="h-4 w-4 opacity-60 transition group-open:rotate-180" fill="currentColor" aria-hidden="true">
                      <path d="M5.5 7.5 10 12l4.5-4.5-1-1L10 10 6.5 6.5z" />
                    </svg>
                  </summary>
                  <div className="mt-1 flex min-w-[12rem] flex-col rounded-xl border border-black/10 bg-surface p-1.5 text-sm shadow-[var(--shadow-pop)] lg:absolute lg:right-0 dark:border-white/10">
                    <Link href="/profile" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10">
                      My profile &amp; campaigns
                    </Link>
                    <Link href="/settings/notifications" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10">
                      Notification settings
                    </Link>
                    {user.isAdmin && (
                      <Link href="/admin/boards" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10">
                        Admin
                      </Link>
                    )}
                    <button
                      onClick={handleSignOut}
                      className="rounded-lg px-3 py-2 text-left text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      Sign out
                    </button>
                  </div>
                </details>
              </>
            ) : (
              <Link
                href="/signin"
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-1.5 text-sm font-semibold text-white"
              >
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
