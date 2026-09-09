"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { InitiativeEntry } from "@/lib/types";
import Section from "@/components/Section";

/** Backlog #33: DM dashboard basics -- an initiative tracker. Only ever
 * rendered for the DM (see app/campaigns/[id]/page.tsx's `{isDm && ...}`
 * gate), same convention as DmControls. Session-local working state: the
 * running order persists as "current state" (like PartyNotesPanel) until
 * the DM explicitly clears it -- there's no automatic reset. */
export default function InitiativeTrackerPanel({ campaignId }: { campaignId: string }) {
  const [entries, setEntries] = useState<InitiativeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [initiative, setInitiative] = useState("");
  const [hp, setHp] = useState("");
  const [notes, setNotes] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editInitiative, setEditInitiative] = useState("");
  const [editHp, setEditHp] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/initiative`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries ?? []);
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

  async function addEntry(e: FormEvent) {
    e.preventDefault();
    const parsedInitiative = Number(initiative);
    if (!name.trim() || !Number.isFinite(parsedInitiative)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/initiative`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, initiative: parsedInitiative, hp, notes }),
    });
    if (res.ok) {
      setName("");
      setInitiative("");
      setHp("");
      setNotes("");
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't add that combatant.");
    }
    setBusy(false);
  }

  function startEdit(entry: InitiativeEntry) {
    setEditingId(entry.id);
    setEditName(entry.name);
    setEditInitiative(String(entry.initiative));
    setEditHp(entry.hp ?? "");
    setEditNotes(entry.notes);
  }

  async function saveEdit(entryId: string) {
    const parsedInitiative = Number(editInitiative);
    if (!editName.trim() || !Number.isFinite(parsedInitiative)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/initiative/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        initiative: parsedInitiative,
        hp: editHp,
        notes: editNotes,
      }),
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

  async function remove(entryId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/initiative/${entryId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't remove that combatant.");
    }
    setBusy(false);
  }

  async function move(entryId: string, direction: "up" | "down") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/initiative/${entryId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't reorder.");
    }
    setBusy(false);
  }

  async function clearAll() {
    if (entries.length === 0) return;
    if (!confirm("Clear the whole initiative tracker? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/initiative`, { method: "DELETE" });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't clear the tracker.");
    }
    setBusy(false);
  }

  return (
    <Section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">Initiative tracker</h2>
        {entries.length > 0 && (
          <button disabled={busy} onClick={clearAll} className="text-sm underline disabled:opacity-50">
            Clear all
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-black/60 dark:text-white/60">
        DM-only running order for combat -- not visible to players. Persists between sessions until
        you clear it.
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm">Loading...</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {entries.map((entry, i) => (
            <li
              key={entry.id}
              className="rounded border border-black/10 p-2 text-sm dark:border-white/10"
            >
              {editingId === entry.id ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Name"
                      aria-label="Combatant name"
                      className="min-w-32 flex-1 rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
                    />
                    <input
                      type="number"
                      value={editInitiative}
                      onChange={(e) => setEditInitiative(e.target.value)}
                      placeholder="Init."
                      aria-label="Initiative"
                      className="w-20 rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
                    />
                    <input
                      value={editHp}
                      onChange={(e) => setEditHp(e.target.value)}
                      placeholder="HP (e.g. 18/24)"
                      aria-label="HP"
                      className="w-32 rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
                    />
                  </div>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notes / conditions"
                    aria-label="Notes / conditions"
                    rows={2}
                    className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => saveEdit(entry.id)}
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
                    <p className="font-medium">
                      {entry.name} <span className="font-normal text-black/60 dark:text-white/60">— init {entry.initiative}</span>
                      {entry.hp && <span className="text-black/60 dark:text-white/60"> · HP {entry.hp}</span>}
                    </p>
                    {entry.notes && <p className="whitespace-pre-wrap text-black/70 dark:text-white/70">{entry.notes}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    <div className="flex gap-1">
                      <button
                        disabled={busy || i === 0}
                        onClick={() => move(entry.id, "up")}
                        aria-label={`Move ${entry.name} up`}
                        className="rounded border border-black/20 px-1.5 disabled:opacity-30 dark:border-white/20"
                      >
                        ↑
                      </button>
                      <button
                        disabled={busy || i === entries.length - 1}
                        onClick={() => move(entry.id, "down")}
                        aria-label={`Move ${entry.name} down`}
                        className="rounded border border-black/20 px-1.5 disabled:opacity-30 dark:border-white/20"
                      >
                        ↓
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(entry)} className="underline">
                        Edit
                      </button>
                      <button onClick={() => remove(entry.id)} className="underline">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
          {entries.length === 0 && (
            <li className="text-black/60 dark:text-white/60">No combatants yet.</li>
          )}
        </ul>
      )}
      <form onSubmit={addEntry} className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-36 rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1">
          Initiative
          <input
            type="number"
            value={initiative}
            onChange={(e) => setInitiative(e.target.value)}
            className="w-20 rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1">
          HP (optional)
          <input
            value={hp}
            onChange={(e) => setHp(e.target.value)}
            placeholder="e.g. 18/24"
            className="w-28 rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-1 min-w-32 flex-col gap-1">
          Notes (optional)
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim() || initiative === ""}
          className="rounded bg-black px-3 py-1.5 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          Add
        </button>
      </form>
    </Section>
  );
}
