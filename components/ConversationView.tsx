"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Message } from "@/lib/types";

export default function ConversationView({ otherUserId }: { otherUserId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [otherUserName, setOtherUserName] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await fetch(`/api/messages/${otherUserId}`);
    if (res.status === 401) {
      router.push("/signin");
      return;
    }
    if (res.status === 404) {
      setGone(true);
      setLoading(false);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
      setViewerId(data.viewerId ?? null);
      setOtherUserName(data.otherUser?.displayName ?? null);
    }
    setLoading(false);
  }, [router, otherUserId]);

  useEffect(() => {
    // load() sets state only after its await resolves, and is also called
    // after sending a message, so it can't be inlined into this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/messages/${otherUserId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft }),
    });
    if (res.ok) {
      setDraft("");
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't send that message.");
    }
    setSending(false);
  }

  if (loading) return <p className="text-sm">Loading...</p>;
  if (gone) return <p className="text-sm">That user doesn&apos;t exist.</p>;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{otherUserName ?? "Conversation"}</h1>
        <Link href="/messages" className="text-sm underline">
          Back to messages
        </Link>
      </div>

      <ul className="flex flex-col gap-2">
        {messages.map((m) => {
          const mine = m.sender_id === viewerId;
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded border p-2 text-sm dark:border-white/10 ${
                  mine ? "border-black/20 bg-black/5 dark:bg-white/10" : "border-black/10"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  {new Date(m.created_at).toLocaleString()}
                </p>
              </div>
            </li>
          );
        })}
        {messages.length === 0 && (
          <li className="text-sm text-black/60 dark:text-white/60">
            No messages yet. Say hello!
          </li>
        )}
      </ul>

      <form onSubmit={handleSend} className="flex flex-col gap-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message..."
          aria-label="Write a message"
          rows={3}
          maxLength={4000}
          className="rounded border border-black/10 p-2 text-sm dark:border-white/10 dark:bg-transparent"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="self-start rounded border border-black/10 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/10"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}
