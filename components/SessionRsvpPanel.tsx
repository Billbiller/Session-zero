"use client";

import { useCallback, useEffect, useState } from "react";
import type { RsvpResponse, SessionRsvpSummary } from "@/lib/types";
import Section from "@/components/Section";

const RESPONSE_LABEL: Record<RsvpResponse, string> = {
  confirmed: "Confirmed",
  declined: "Declined",
};

/** Backlog #35: per-member confirm/decline for a campaign's current
 * next_session_at. Only rendered by the campaign page once a session is
 * actually scheduled (see app/campaigns/[id]/page.tsx), and only behind
 * the same hasPrivateAccess gate as ScheduleForm/PartyNotesPanel/
 * CampaignChatPanel, so every viewer here is already the DM or an
 * active member. A reschedule clears everyone's answer server-side
 * (see lib/schedule.ts), so this panel never needs to reconcile a
 * stale response against a new date itself -- a fresh GET always
 * reflects the current state. */
export default function SessionRsvpPanel({
  campaignId,
  viewerId,
}: {
  campaignId: string;
  viewerId: string | null;
}) {
  const [rsvps, setRsvps] = useState<SessionRsvpSummary[]>([]);
  const [viewerResponse, setViewerResponse] = useState<RsvpResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/rsvp`);
    if (res.ok) {
      const data = await res.json();
      setRsvps(data.rsvps ?? []);
      setViewerResponse(data.viewerResponse ?? null);
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    // load() sets state only after its await resolves, and is also
    // called again after saving a response, so it can't be inlined into
    // this effect body -- same pattern/reasoning as CampaignChatPanel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function save(response: RsvpResponse | null) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/rsvp`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save your RSVP.");
    }
    setSaving(false);
  }

  const confirmed = rsvps.filter((r) => r.response === "confirmed");
  const declined = rsvps.filter((r) => r.response === "declined");
  const noResponse = rsvps.filter((r) => r.response === null);

  return (
    <Section>
      <h2 className="mb-2 font-medium">Who&apos;s in for the next session?</h2>
      {loading ? (
        <p className="text-sm">Loading...</p>
      ) : (
        <>
          {viewerId && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span>Your RSVP:</span>
              <button
                type="button"
                disabled={saving}
                onClick={() => save("confirmed")}
                className={`rounded border px-3 py-1 disabled:opacity-50 ${
                  viewerResponse === "confirmed"
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-black/20 dark:border-white/20"
                }`}
              >
                Confirm
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => save("declined")}
                className={`rounded border px-3 py-1 disabled:opacity-50 ${
                  viewerResponse === "declined"
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-black/20 dark:border-white/20"
                }`}
              >
                Decline
              </button>
              {viewerResponse && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save(null)}
                  className="text-xs underline disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <p className="text-sm">
            <span className="font-medium">{confirmed.length}</span> confirmed
            {" · "}
            <span className="font-medium">{declined.length}</span> declined
            {" · "}
            <span className="font-medium">{noResponse.length}</span> haven&apos;t said yet
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {rsvps.map((r) => (
              <li key={r.userId} className="flex items-center justify-between">
                <span>
                  {r.userName}
                  {r.isDm && <span className="text-black/50 dark:text-white/50"> (DM)</span>}
                </span>
                <span className="text-black/60 dark:text-white/60">
                  {r.response ? RESPONSE_LABEL[r.response] : "No response yet"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}
