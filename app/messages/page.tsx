"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ConversationSummary } from "@/lib/types";

export default function MessagesPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await fetch("/api/messages");
    if (res.status === 401) {
      router.push("/signin");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations ?? []);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    // load() sets state only after its await resolves, same reasoning as
    // every other self-fetching page in this app (see e.g. ProfilePage) --
    // it can't be inlined into this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading) return <p className="text-sm">Loading...</p>;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Messages</h1>
      <ul className="flex flex-col gap-2">
        {conversations.map((c) => (
          <li key={c.otherUserId}>
            <Link
              href={`/messages/${c.otherUserId}`}
              className={`flex items-center justify-between gap-3 rounded border p-3 text-sm dark:border-white/10 ${
                c.unreadCount > 0 ? "border-black/20" : "border-black/10 opacity-80"
              }`}
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{c.otherUserName}</span>
                <span className="truncate text-black/60 dark:text-white/60">
                  {c.lastMessage.body}
                </span>
              </div>
              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                <span className="text-xs text-black/50 dark:text-white/50">
                  {new Date(c.lastMessage.createdAt).toLocaleDateString()}
                </span>
                {c.unreadCount > 0 && (
                  <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-medium text-white">
                    {c.unreadCount}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
        {conversations.length === 0 && (
          <li className="text-sm text-black/60 dark:text-white/60">
            No conversations yet. Visit another player&apos;s profile to send them a message.
          </li>
        )}
      </ul>
    </div>
  );
}
