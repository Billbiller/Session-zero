"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { NpcNote } from "@/lib/types";
import Section from "@/components/Section";

/** Backlog #33: DM dashboard basics -- NPC quick-notes. Only ever
 * rendered for the DM (see app/campaigns/[id]/page.tsx's `{isDm && ...}`
 * gate), same convention as DmControls/InitiativeTrackerPanel. A simple
 * name + free-text notes list -- no separate "quick notes" concept
 * beyond that pair. */
export default function NpcNotesPanel({ campaignId }: { campaignId: string }) {
  const [npcs, setNpcs] = useState<NpcNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/npcs`);
    if (res.ok) {
      const data = await res.json();
      setNpcs(data.npcs ?? []);
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    // load() only sets state after its await resolves and is also called
    // again after every mutation below, so it can't be inlined into this
    // effect body -- same pattern as CampaignChatPanel/PartyNotesPanel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function addNpc(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/npcs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, notes }),
    });
    if (res.ok) {
      setName("");
      setNotes("");
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't add that NPC.");
    }
    setBusy(false);
  }

  function startEdit(npc: NpcNote) {
    setEditingId(npc.id);
    setEditName(npc.name);
    setEditNotes(npc.notes);
  }

  async function saveEdit(npcId: string) {
    if (!editName.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/npcs/${npcId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, notes: editNotes }),
    });
    if (res.ok) {
      setEditingId(null);
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save that change.");
    }
    setBusy(false);
  }

  async function remove(npcId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/npcs/${npcId}`, { method: "DELETE" });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't remove that NPC.");
    }
    setBusy(false);
  }

  return (
    <Section>
      <h2 className="mb-2 font-medium">NPC quick-notes</h2>
      <p className="mb-3 text-xs text-black/60 dark:text-white/60">
        DM-only prep notes -- not visible to players.
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm">Loading...</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {npcs.map((npc) => (
            <li key={npc.id} className="rounded border border-black/10 p-2 text-sm dark:border-white/10">
              {editingId === npc.id ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Name"
                    aria-label="NPC name"
                    className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
                  />
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notes"
                    aria-label="NPC notes"
                    rows={3}
                    className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => saveEdit(npc.id)}
                      className="rounded bg-black px-2 py-1 text-white disabled:opacity-50 dark:bg-white dark:text-black"
                    >
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="underline">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{npc.name}</p>
                    {npc.notes && <p className="whitespace-pre-wrap text-black/70 dark:text-white/70">{npc.notes}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2 text-xs">
                    <button onClick={() => startEdit(npc)} className="underline">
                      Edit
                    </button>
                    <button onClick={() => remove(npc.id)} className="underline">
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {npcs.length === 0 && <li className="text-black/60 dark:text-white/60">No NPCs noted yet.</li>}
        </ul>
      )}
      <form onSubmit={addNpc} className="flex flex-col gap-2 text-sm">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="NPC name"
          aria-label="NPC name"
          className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          aria-label="NPC notes"
          rows={2}
          className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="w-fit rounded bg-black px-3 py-1.5 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          Add NPC
        </button>
      </form>
    </Section>
  );
}
