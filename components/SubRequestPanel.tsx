"use client";

import { useEffect, useState, useCallback } from "react";
import type { SubRequestSummary, SubVolunteerWithName, SubPlacementSummary } from "@/lib/types";
import Section from "@/components/Section";

const STATUS_LABELS: Record<SubRequestSummary["status"], string> = {
  open: "Open",
  filled: "Filled",
  cancelled: "Cancelled",
};

/** The campaign-page half of backlog #20 (substitute player workflow).
 * Phase 1: a DM or approved member posts "looking for a sub," anyone
 * signed in can volunteer, and the requester/DM can mark a request filled
 * or cancelled directly. Phase 2 (this file, added 2026-09-06): if the
 * request names a specific character, the requester/DM can instead pick a
 * volunteer to move forward as a "placement" -- the character's owner
 * (always the requester, since a request can only name a character the
 * requester owns) and the campaign's DM each approve or decline it. Per
 * an explicit product decision, the rest of the active party is notified
 * of a placement's outcome but isn't a blocking third approval gate --
 * this state machine only has two approvers. Once both approve, the
 * character shows a "currently piloted by" badge (see CharacterSummary)
 * until the owner/DM ends the sub. */
export default function SubRequestPanel({
  campaignId,
  viewerId,
  isDm,
  canPost,
  myCharacters,
}: {
  campaignId: string;
  viewerId: string | null;
  isDm: boolean;
  canPost: boolean;
  /** The viewer's own characters currently linked to this campaign --
   * offered as an optional pick when posting a request, since only a
   * character the requester owns can go through phase-2 approval. */
  myCharacters: { id: string; name: string }[];
}) {
  const [requests, setRequests] = useState<SubRequestSummary[]>([]);
  const [placementsById, setPlacementsById] = useState<Record<string, SubPlacementSummary[]>>({});
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [guardrailsDrafts, setGuardrailsDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [volunteersById, setVolunteersById] = useState<Record<string, SubVolunteerWithName[]>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/subs`);
    if (res.ok) {
      const data = await res.json();
      const loadedRequests: SubRequestSummary[] = data.requests ?? [];
      setRequests(loadedRequests);
      // Placements are informational for everyone (see file doc comment),
      // so they're loaded up front rather than lazily like the volunteer
      // list, which stays owner/DM-only.
      const entries = await Promise.all(
        loadedRequests
          .filter((r) => r.character_id)
          .map(async (r) => {
            const pRes = await fetch(`/api/subs/${r.id}/placements`);
            const pData = await pRes.json().catch(() => ({}));
            return [r.id, pRes.ok ? (pData.placements ?? []) : []] as const;
          })
      );
      setPlacementsById(Object.fromEntries(entries));
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
      body: JSON.stringify({ note, characterId: characterId || undefined }),
    });
    setPosting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setNote("");
    setCharacterId("");
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

  async function selectVolunteer(requestId: string, volunteerId: string) {
    setBusyId(requestId);
    setError(null);
    const res = await fetch(`/api/subs/${requestId}/placements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volunteerId }),
    });
    setBusyId(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    await load();
  }

  async function ownerReview(placementId: string, approve: boolean) {
    setBusyId(placementId);
    setError(null);
    const res = await fetch(`/api/subs/placements/${placementId}/owner-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve, guardrailsNote: guardrailsDrafts[placementId] }),
    });
    setBusyId(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    await load();
  }

  async function dmReview(placementId: string, approve: boolean) {
    setBusyId(placementId);
    setError(null);
    const res = await fetch(`/api/subs/placements/${placementId}/dm-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    setBusyId(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    await load();
  }

  async function cancelPlacement(placementId: string) {
    setBusyId(placementId);
    setError(null);
    const res = await fetch(`/api/subs/placements/${placementId}/cancel`, { method: "POST" });
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
          {myCharacters.length > 0 && (
            <label className="flex flex-col gap-1 text-xs">
              Character needing a sub (optional -- only a named character can go through
              owner/DM approval below)
              <select
                value={characterId}
                onChange={(e) => setCharacterId(e.target.value)}
                className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
              >
                <option value="">No specific character</option>
                {myCharacters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
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
          const placements = placementsById[r.id] ?? [];
          const activePlacement = placements.find(
            (p) => p.status === "pending" || p.status === "confirmed"
          );
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
              {r.characterName && (
                <p className="mt-1 text-xs text-black/60 dark:text-white/60">
                  For character: {r.characterName}
                </p>
              )}
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
                    <li key={v.id} className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-medium">{v.volunteerName}</span>
                        {v.message && `: ${v.message}`}
                      </span>
                      {r.character_id && r.status === "open" && !activePlacement && (
                        <button
                          disabled={busyId === r.id}
                          onClick={() => selectVolunteer(r.id, v.volunteer_id)}
                          className="shrink-0 rounded border border-black/20 px-2 py-0.5 disabled:opacity-50 dark:border-white/20"
                        >
                          Select for approval
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {activePlacement && (
                <div className="mt-2 rounded border border-black/10 p-2 text-xs dark:border-white/10">
                  <p className="font-medium">
                    {activePlacement.status === "confirmed" ? "Confirmed: " : "Selected: "}
                    {activePlacement.volunteerName}
                  </p>
                  <p className="mt-1 text-black/60 dark:text-white/60">
                    Owner ({activePlacement.ownerName}):{" "}
                    {activePlacement.owner_approved ? "approved" : "pending"} &middot; DM (
                    {activePlacement.dmName}): {activePlacement.dm_approved ? "approved" : "pending"}
                  </p>

                  {viewerId === activePlacement.ownerId && activePlacement.status === "pending" && (
                    <div className="mt-2 flex flex-col gap-1">
                      <textarea
                        value={guardrailsDrafts[activePlacement.id] ?? activePlacement.guardrails_note}
                        onChange={(e) =>
                          setGuardrailsDrafts((prev) => ({
                            ...prev,
                            [activePlacement.id]: e.target.value,
                          }))
                        }
                        rows={2}
                        maxLength={500}
                        placeholder="Guardrails for whoever runs this character (e.g. no permanent death, ask before spending our one rare potion)"
                        className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
                      />
                      <div className="flex gap-2">
                        <button
                          disabled={busyId === activePlacement.id}
                          onClick={() => ownerReview(activePlacement.id, true)}
                          className="rounded bg-black px-2 py-1 text-white disabled:opacity-50 dark:bg-white dark:text-black"
                        >
                          Approve
                        </button>
                        <button
                          disabled={busyId === activePlacement.id}
                          onClick={() => ownerReview(activePlacement.id, false)}
                          className="underline disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  )}

                  {activePlacement.guardrails_note && viewerId !== activePlacement.ownerId && (
                    <p className="mt-1 italic text-black/60 dark:text-white/60">
                      Guardrails: {activePlacement.guardrails_note}
                    </p>
                  )}

                  {isDm && activePlacement.status === "pending" && (
                    <div className="mt-2 flex gap-2">
                      <button
                        disabled={busyId === activePlacement.id}
                        onClick={() => dmReview(activePlacement.id, true)}
                        className="rounded bg-black px-2 py-1 text-white disabled:opacity-50 dark:bg-white dark:text-black"
                      >
                        Approve
                      </button>
                      <button
                        disabled={busyId === activePlacement.id}
                        onClick={() => dmReview(activePlacement.id, false)}
                        className="underline disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  )}

                  {isOwner && activePlacement.status === "pending" && (
                    <button
                      disabled={busyId === activePlacement.id}
                      onClick={() => cancelPlacement(activePlacement.id)}
                      className="mt-2 underline disabled:opacity-50"
                    >
                      Cancel placement
                    </button>
                  )}
                </div>
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
