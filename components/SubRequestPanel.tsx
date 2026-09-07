"use client";

import { useEffect, useState, useCallback } from "react";
import type { SubRequestSummary, SubVolunteerWithName } from "@/lib/types";
import Section from "@/components/Section";

const STATUS_LABELS: Record<SubRequestSummary["status"], string> = {
  open: "Open",
  filled: "Filled",
  cancelled: "Cancelled",
};

/** The campaign-page half of backlog #20 phase 1 (substitute player
 * workflow, request + volunteer pool only -- no approval state machine or
 * character custody yet). A DM or approved member can post "looking for a
 * sub," anyone signed in can volunteer, and the requester/DM can see who
 * volunteered and mark the request filled or cancelled -- that decision
 * itself stays manual for this phase, made by a person reading the
 * volunteer list, not by this system. */
export default function SubRequestPanel({
  campaignId,
  viewerId,
  isDm,
  canPost,
}: {
  campaignId: string;
  viewerId: string | null;
  isDm: boolean;
  canPost: boolean;
}) {
  const [requests, setRequests] = useState<SubRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [volunteersById, setVolunteersById] = useState<Record<string, SubVolunteerWithName[]>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/subs`);
    if (res.ok) {
      const data = await res.json();
      setRequests(data.requests ?? []);
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    // load() sets state only after its await resolves, so it can't be
    // inlined into this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function post() {
    setPosting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/subs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setPosting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setNote("");
    await load();
  }

  async function volunteer(requestId: string) {
    setBusyId(requestId);
    setError(null);
    const res = await fetch(`/api/subs/${requestId}/volunteer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: messages[requestId] ?? "" }),
    });
    setBusyId(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    await load();
  }

  async function withdraw(requestId: string) {
    setBusyId(requestId);
    setError(null);
    const res = await fetch(`/api/subs/${requestId}/volunteer`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    await load();
  }

  async function toggleVolunteerList(requestId: string) {
    if (volunteersById[requestId]) {
      setVolunteersById((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      return;
    }
    const res = await fetch(`/api/subs/${requestId}/volunteers`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setVolunteersById((prev) => ({ ...prev, [requestId]: data.volunteers ?? [] }));
  }

  async function setStatus(requestId: string, status: "filled" | "cancelled") {
    setBusyId(requestId);
    setError(null);
    const res = await fetch(`/api/subs/${requestId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    await load();
  }

  if (loading) return null;
  // Nothing to post and nothing to show -- don't take up space on a
  // campaign that's never needed a sub.
  if (requests.length === 0 && !canPost) return null;

  return (
    <Section>
      <h2 className="mb-2 font-medium">Looking for a sub</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {canPost && (
        <div className="mb-3 flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. Can't make it Sept 20th, need someone to run my rogue for one session."
            className="rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          />
          <button
            disabled={posting}
            onClick={post}
            className="w-fit rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Post a sub request
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-3 text-sm">
        {requests.map((r) => {
          const isOwner = isDm || r.requester_id === viewerId;
          const volunteers = volunteersById[r.id];
          return (
            <li key={r.id} className="border-t border-black/10 pt-3 first:border-t-0 first:pt-0 dark:border-white/10">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{r.requesterName}</p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    r.status === "open"
                      ? "border-black/20 dark:border-white/20"
                      : "border-black/10 text-black/50 dark:border-white/10 dark:text-white/50"
                  }`}
                >
                  {STATUS_LABELS[r.status]}
                </span>
              </div>
              {r.note && <p className="mt-1">{r.note}</p>}
              <p className="mt-1 text-xs text-black/60 dark:text-white/60">
                {r.volunteerCount} volunteer{r.volunteerCount === 1 ? "" : "s"} so far
              </p>

              {isOwner && r.status === "open" && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <button onClick={() => toggleVolunteerList(r.id)} className="underline">
                    {volunteers ? "Hide volunteers" : "View volunteers"}
                  </button>
                  <button
                    disabled={busyId === r.id}
                    onClick={() => setStatus(r.id, "filled")}
                    className="rounded bg-black px-2 py-1 text-white disabled:opacity-50 dark:bg-white dark:text-black"
                  >
                    Mark filled
                  </button>
                  <button
                    disabled={busyId === r.id}
                    onClick={() => setStatus(r.id, "cancelled")}
                    className="underline disabled:opacity-50"
                  >
                    Cancel request
                  </button>
                </div>
              )}

              {isOwner && volunteers && (
                <ul className="mt-2 flex flex-col gap-1 rounded bg-black/5 p-2 text-xs dark:bg-white/5">
                  {volunteers.length === 0 && <li>No volunteers yet.</li>}
                  {volunteers.map((v) => (
                    <li key={v.id}>
                      <span className="font-medium">{v.volunteerName}</span>
                      {v.message && `: ${v.message}`}
                    </li>
                  ))}
                </ul>
              )}

              {!isOwner && viewerId && r.status === "open" && (
                <div className="mt-2 flex flex-col gap-1">
                  {r.viewerHasVolunteered ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-black/60 dark:text-white/60">You&apos;ve volunteered.</span>
                      <button
                        disabled={busyId === r.id}
                        onClick={() => withdraw(r.id)}
                        className="underline disabled:opacity-50"
                      >
                        Withdraw
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 sm:flex-row">
                      <input
                        value={messages[r.id] ?? ""}
                        onChange={(e) =>
                          setMessages((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        maxLength={500}
                        placeholder="Optional note to the requester"
                        className="flex-1 rounded border border-black/20 px-2 py-1 text-xs dark:border-white/20 dark:bg-transparent"
                      />
                      <button
                        disabled={busyId === r.id}
                        onClick={() => volunteer(r.id)}
                        className="w-fit rounded bg-black px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-black"
                      >
                        Volunteer
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {requests.length === 0 && (
          <li className="text-black/60 dark:text-white/60">No sub requests posted yet.</li>
        )}
      </ul>
    </Section>
  );
}
