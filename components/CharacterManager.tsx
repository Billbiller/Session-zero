"use client";

import { useEffect, useState, useCallback } from "react";
import type { Character, CharacterStatus } from "@/lib/types";
import { CHARACTER_AVATARS, CHARACTER_STATUSES, CHARACTER_STATUS_LABELS } from "@/lib/types";
import CharacterSummary from "./CharacterSummary";

type CharacterWithCampaignTitle = Character & { campaignTitle: string | null };

interface AssignableCampaign {
  id: string;
  title: string;
}

interface FormState {
  name: string;
  archetype: string;
  bio: string;
  backstory: string;
  avatarEmoji: string;
  /** "" means "not linked to a campaign" in the <select>; converted to
   * null/omitted before hitting the API. */
  campaignId: string;
  status: CharacterStatus;
  epilogue: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  archetype: "",
  bio: "",
  backstory: "",
  avatarEmoji: CHARACTER_AVATARS[0],
  campaignId: "",
  status: "active",
  epilogue: "",
};

function formFromCharacter(character: CharacterWithCampaignTitle): FormState {
  return {
    name: character.name,
    archetype: character.archetype,
    bio: character.bio,
    backstory: character.backstory,
    avatarEmoji: character.avatar_emoji,
    campaignId: character.campaign_id ?? "",
    status: character.status,
    epilogue: character.epilogue,
  };
}

export default function CharacterManager({
  assignableCampaigns,
}: {
  /** Campaigns the signed-in user is currently the DM of or an active
   * member of — the only campaigns a character can (re)link to, since
   * linking is access-checked server-side the same way. */
  assignableCampaigns: AssignableCampaign[];
}) {
  const [characters, setCharacters] = useState<CharacterWithCampaignTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState<FormState>(EMPTY_FORM);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/characters");
    if (res.ok) {
      const data = await res.json();
      setCharacters(data.characters ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // load() only sets state after its await resolves, and is also called
    // after create/update/delete, so it can't be inlined into this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function campaignOptionsFor(form: FormState) {
    // If a character is linked to a campaign the user no longer has in
    // their assignable list (e.g. they've since left it), keep that option
    // visible and selected rather than silently dropping the link the
    // moment the edit form renders.
    const options = [...assignableCampaigns];
    if (form.campaignId && !options.some((c) => c.id === form.campaignId)) {
      const current = characters.find((c) => c.id === editingId);
      options.push({
        id: form.campaignId,
        title: current?.campaignTitle ?? "Campaign no longer available",
      });
    }
    return options;
  }

  function toPayload(form: FormState) {
    return {
      name: form.name,
      archetype: form.archetype,
      bio: form.bio,
      backstory: form.backstory,
      avatarEmoji: form.avatarEmoji,
      campaignId: form.campaignId ? form.campaignId : null,
      status: form.status,
      epilogue: form.epilogue,
    };
  }

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(newForm)),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setNewForm(EMPTY_FORM);
    setAdding(false);
    await load();
  }

  async function handleSaveEdit(id: string) {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/characters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(editForm)),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setEditingId(null);
    await load();
  }

  async function handleDelete(id: string) {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/characters/${id}`, { method: "DELETE" });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setConfirmingDeleteId(null);
    await load();
  }

  function characterForm(
    form: FormState,
    setForm: (f: FormState) => void,
    onSubmit: () => void,
    onCancel: () => void,
    submitLabel: string
  ) {
    return (
      <div className="flex flex-col gap-2 rounded border border-black/10 p-3 text-sm dark:border-white/10">
        <label className="flex flex-col gap-1">
          Name
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={100}
            placeholder="Character name"
            className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1">
          Class / ancestry / role
          <input
            value={form.archetype}
            onChange={(e) => setForm({ ...form, archetype: e.target.value })}
            maxLength={150}
            placeholder="e.g. Level 5 Ranger, or Techno-mage archetype"
            className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1">
          Portrait
          <select
            value={form.avatarEmoji}
            onChange={(e) => setForm({ ...form, avatarEmoji: e.target.value })}
            className="w-fit rounded border border-black/20 px-2 py-1 text-lg dark:border-white/20 dark:bg-transparent"
          >
            {CHARACTER_AVATARS.map((emoji) => (
              <option key={emoji} value={emoji}>
                {emoji}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Playing in
          <select
            value={form.campaignId}
            onChange={(e) => setForm({ ...form, campaignId: e.target.value })}
            className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
          >
            <option value="">Not linked to a campaign</option>
            {campaignOptionsFor(form).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Bio
          <textarea
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            rows={2}
            maxLength={1000}
            placeholder="A short description."
            className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1">
          Backstory
          <textarea
            value={form.backstory}
            onChange={(e) => setForm({ ...form, backstory: e.target.value })}
            rows={4}
            maxLength={4000}
            placeholder="Where they came from, what they want."
            className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1">
          Status
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}
            className="w-fit rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
          >
            {CHARACTER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CHARACTER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        {form.status !== "active" && (
          <label className="flex flex-col gap-1">
            Epilogue
            <textarea
              value={form.epilogue}
              onChange={(e) => setForm({ ...form, epilogue: e.target.value })}
              rows={2}
              maxLength={2000}
              placeholder="How it ended."
              className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
            />
          </label>
        )}
        <div className="flex gap-2">
          <button
            disabled={submitting || !form.name.trim()}
            onClick={onSubmit}
            className="w-fit rounded bg-black px-3 py-1.5 text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {submitLabel}
          </button>
          <button onClick={onCancel} className="underline">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (loading) return <p className="text-sm">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">My characters</h2>
        {!adding && (
          <button
            onClick={() => {
              setNewForm(EMPTY_FORM);
              setAdding(true);
            }}
            className="text-sm underline"
          >
            Add a character
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {adding && (
        <div className="mt-3">
          {characterForm(
            newForm,
            setNewForm,
            handleCreate,
            () => setAdding(false),
            "Create"
          )}
        </div>
      )}
      <ul className="mt-3 flex flex-col gap-3 text-sm">
        {characters.map((c) => (
          <li key={c.id} className="border-t border-black/10 pt-3 dark:border-white/10">
            {editingId === c.id ? (
              characterForm(
                editForm,
                setEditForm,
                () => handleSaveEdit(c.id),
                () => setEditingId(null),
                "Save"
              )
            ) : (
              <div className="flex items-start justify-between gap-3">
                <CharacterSummary
                  character={c}
                  linkedCampaign={
                    c.campaign_id ? { id: c.campaign_id, title: c.campaignTitle ?? "" } : null
                  }
                />
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  <button
                    onClick={() => {
                      setEditingId(c.id);
                      setEditForm(formFromCharacter(c));
                    }}
                    className="underline"
                  >
                    Edit
                  </button>
                  {confirmingDeleteId === c.id ? (
                    <span className="flex items-center gap-2">
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={submitting}
                        className="text-red-600 underline dark:text-red-400"
                      >
                        Confirm delete
                      </button>
                      <button onClick={() => setConfirmingDeleteId(null)} className="underline">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmingDeleteId(c.id)}
                      className="text-red-600 underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
        {characters.length === 0 && !adding && (
          <li className="text-black/60 dark:text-white/60">
            No characters yet — add one to show up on your public profile.
          </li>
        )}
      </ul>
    </div>
  );
}
