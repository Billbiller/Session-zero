"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CampaignMessageWithSender } from "@/lib/types";
import Section from "@/components/Section";

/** Backlog #32: a group thread per campaign's active party, separate
 * from 1:1 direct messages (ConversationView) and from the persistent
 * PartyNotesPanel document. Only rendered behind the campaign page's
 * own hasPrivateAccess gate (same as PartyNotesPanel/SessionLogPanel),
 * so every viewer here is already the DM or an active member. */
export default function CampaignChatPanel({
  campaignId,
  viewerId,
  initialUnreadCount = 0,
}: {
  campaignId: string;
  viewerId: string | null;
  /** Backlog #45: a one-time server-computed snapshot of how many
   * messages were unread when this page was requested, taken *before*
   * this panel's own load() below fires and marks the thread read --
   * see app/campaigns/[id]/page.tsx. Shown next to the heading for the
   * lifetime of this page view; it deliberately doesn't live-update
   * (once you're looking at the panel, the transcript itself is the
   * up-to-date signal). */
  initialUnreadCount?: number;
}) {
  const [messages, setMessages] = useState<CampaignMessageWithSender[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/chat`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    // load() sets state only after its await resolves, and is also
    // called again after sending a message, so it can't be inlined into
    // this effect body -- same pattern/reasoning as PartyNotesPanel and
    // ConversationView.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/chat`, {
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

  return (
    <Section>
      <h2 className="mb-2 font-medium">
        Table chat
        {initialUnreadCount > 0 && (
          <span className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-medium text-white">
            {initialUnreadCount} new
          </span>
        )}
      </h2>
      {loading ? (
        <p className="text-sm">Loading...</p>
      ) : (
        <ul className="mb-3 flex max-h-96 flex-col gap-2 overflow-y-auto">
          {messages.map((m) => {
            const mine = m.sender_id === viewerId;
            return (
              <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded border p-2 text-sm dark:border-white/10 ${
                    mine ? "border-black/20 bg-black/5 dark:bg-white/10" : "border-black/10"
                  }`}
                >
                  {!mine && (
                    <p className="text-xs font-medium text-black/60 dark:text-white/60">
                      {m.senderName}
                    </p>
                  )}
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
              No messages yet. Say hello to the table!
            </li>
          )}
        </ul>
      )}
      <form onSubmit={handleSend} className="flex flex-col gap-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the table..."
          aria-label="Message the table"
          rows={2}
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
    </Section>
  );
}
