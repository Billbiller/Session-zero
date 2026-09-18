"use client";

import { useEffect, useState, useCallback } from "react";
import type { Character, CharacterStatus, Sheet5e } from "@/lib/types";
import {
  CHARACTER_AVATARS,
  CHARACTER_STATUSES,
  CHARACTER_STATUS_LABELS,
  ABILITY_SCORES_5E,
  ABILITY_SCORE_5E_LABELS,
  SKILLS_5E,
  SKILL_5E_LABELS,
  curatedSystemMatches,
} from "@/lib/types";
import {
  abilityModifier,
  formatModifier,
  defaultSheet5e,
  MIN_ABILITY_SCORE,
  MAX_ABILITY_SCORE,
  MIN_PROFICIENCY_BONUS,
  MAX_PROFICIENCY_BONUS,
} from "@/lib/sheet5e";
import CharacterSummary from "./CharacterSummary";

type CharacterWithCampaignTitle = Character & { campaignTitle: string | null; pilotName: string | null };

interface AssignableCampaign {
  id: string;
  title: string;
  /** Backlog #56: the linked campaign's free-text system, so this form
   * can decide client-side (via curatedSystemMatches) whether to show
   * the 5e stat-block section for whichever campaign is selected. */
  system: string;
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
  /** null = no uploaded portrait (shows avatarEmoji instead); a data: URL =
   * the current/uploaded portrait. Always sent as-is on submit (even if
   * unchanged) — simpler than tracking a separate "touched" flag, and
   * idempotent since the server just re-validates and re-stores it. */
  portraitDataUrl: string | null;
  /** Backlog #56: null = no 5e stat block filled in (or not applicable).
   * Unlike portraitDataUrl, this is deliberately *not* always sent as-is
   * -- see toPayload()'s own comment -- since re-sending stale sheet data
   * for a character no longer linked to a 5e campaign would trip the
   * server's own 5e-only gate on an otherwise-unrelated edit. */
  sheet5e: Sheet5e | null;
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
  portraitDataUrl: null,
  sheet5e: null,
};

// Mirrors MAX_PORTRAIT_DATA_URL_LENGTH's ~200KB budget in
// lib/characters.ts, checked against the raw file here (before base64
// inflates it ~33%) so a too-large file is rejected immediately instead of
// after an upload+encode round trip.
const MAX_PORTRAIT_FILE_BYTES = 200 * 1024;

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
    portraitDataUrl: character.portrait_data_url,
    sheet5e: character.sheet_5e,
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
        // Unknown here (this is the "you've since lost access" fallback
        // option, not a real assignable campaign) -- an empty system
        // never matches curatedSystemMatches, which is the conservative/
        // safe default: don't offer to edit a 5e sheet for a campaign
        // this form can't actually confirm the system of.
        system: "",
      });
    }
    return options;
  }

  /** Backlog #56: whether the campaign currently selected in this form
   * matches the curated "dnd-5e" system -- gates whether the 5e
   * stat-block section renders at all. Purely a display decision (see
   * curatedSystemMatches's own doc comment); the server independently
   * re-checks this via lib/characters.ts's isLinkedToDnd5e before ever
   * storing a sheet. */
  function isDnd5eSelected(form: FormState): boolean {
    if (!form.campaignId) return false;
    const campaign = campaignOptionsFor(form).find((c) => c.id === form.campaignId);
    return campaign ? curatedSystemMatches(campaign.system, "dnd-5e") : false;
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
      portraitDataUrl: form.portraitDataUrl,
      // Backlog #56: only include sheet5e when the selected campaign is
      // currently 5e-linked. Unlike portraitDataUrl, this is deliberately
      // *not* always sent as-is: formFromCharacter() copies whatever
      // sheet5e a character already has (even one left over from a 5e
      // campaign it's since been unlinked from -- see the doc comment on
      // Character.sheet_5e in lib/types.ts), and re-sending that stale
      // object on an unrelated edit (e.g. just fixing a typo in the bio)
      // would trip the server's own 5e-only gate for no reason. Omitting
      // the key entirely means "leave unchanged" server-side, matching
      // campaignId's own undefined convention.
      ...(isDnd5eSelected(form) ? { sheet5e: form.sheet5e } : {}),
    };
  }

  function handlePortraitFile(
    file: File | undefined,
    form: FormState,
    setForm: (f: FormState) => void
  ) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_PORTRAIT_FILE_BYTES) {
      setError(
        `That image is too large — please use one under ${Math.round(MAX_PORTRAIT_FILE_BYTES / 1024)}KB.`
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setForm({ ...form, portraitDataUrl: reader.result });
      }
    };
    reader.onerror = () => setError("Couldn't read that image — please try again.");
    reader.readAsDataURL(file);
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

  /** Backlog #56: the 5e stat block editor, rendered inside characterForm
   * only when isDnd5eSelected(form) is true. A self-contained function
   * (rather than its own component) for the same reason characterForm
   * itself already is one -- it closes over setForm's caller-specific
   * setter without needing controlled/uncontrolled prop plumbing for a
   * section that only ever renders inside that one form. */
  function sheet5eSection(form: FormState, setForm: (f: FormState) => void) {
    const sheet = form.sheet5e;

    if (!sheet) {
      return (
        <div className="rounded border border-dashed border-black/20 p-3 text-sm dark:border-white/20">
          <p className="text-black/60 dark:text-white/60">
            This character is playing in a D&amp;D 5e campaign.
          </p>
          <button
            type="button"
            onClick={() => setForm({ ...form, sheet5e: defaultSheet5e() })}
            className="mt-1 underline"
          >
            Add a 5e stat block
          </button>
        </div>
      );
    }

    function setSheet(next: Sheet5e) {
      setForm({ ...form, sheet5e: next });
    }

    return (
      <div className="flex flex-col gap-3 rounded border border-black/20 p-3 text-sm dark:border-white/20">
        <div className="flex items-center justify-between">
          <p className="font-medium">5e stat block</p>
          <button
            type="button"
            onClick={() => setForm({ ...form, sheet5e: null })}
            className="text-xs text-red-600 underline dark:text-red-400"
          >
            Remove stat block
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITY_SCORES_5E.map((ability) => (
            <label key={ability} className="flex flex-col gap-1 text-xs">
              {ABILITY_SCORE_5E_LABELS[ability].slice(0, 3)}
              <input
                type="number"
                min={MIN_ABILITY_SCORE}
                max={MAX_ABILITY_SCORE}
                value={sheet.abilityScores[ability]}
                onChange={(e) =>
                  setSheet({
                    ...sheet,
                    abilityScores: {
                      ...sheet.abilityScores,
                      [ability]: Number(e.target.value),
                    },
                  })
                }
                className="rounded border border-black/20 px-1 py-1 dark:border-white/20 dark:bg-transparent"
              />
              <span className="text-black/60 dark:text-white/60">
                {formatModifier(abilityModifier(sheet.abilityScores[ability]))}
              </span>
            </label>
          ))}
        </div>

        <label className="flex w-fit flex-col gap-1 text-xs">
          Proficiency bonus
          <input
            type="number"
            min={MIN_PROFICIENCY_BONUS}
            max={MAX_PROFICIENCY_BONUS}
            value={sheet.proficiencyBonus}
            onChange={(e) => setSheet({ ...sheet, proficiencyBonus: Number(e.target.value) })}
            className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
          />
        </label>

        <div>
          <p className="text-xs text-black/60 dark:text-white/60">Saving throw proficiencies</p>
          <div className="mt-1 flex flex-wrap gap-3">
            {ABILITY_SCORES_5E.map((ability) => (
              <label key={ability} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={sheet.savingThrowProficiencies.includes(ability)}
                  onChange={(e) =>
                    setSheet({
                      ...sheet,
                      savingThrowProficiencies: e.target.checked
                        ? [...sheet.savingThrowProficiencies, ability]
                        : sheet.savingThrowProficiencies.filter((a) => a !== ability),
                    })
                  }
                />
                {ABILITY_SCORE_5E_LABELS[ability]}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-black/60 dark:text-white/60">Skill proficiencies</p>
          <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
            {SKILLS_5E.map((skill) => (
              <label key={skill} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={sheet.skillProficiencies.includes(skill)}
                  onChange={(e) =>
                    setSheet({
                      ...sheet,
                      skillProficiencies: e.target.checked
                        ? [...sheet.skillProficiencies, skill]
                        : sheet.skillProficiencies.filter((s) => s !== skill),
                    })
                  }
                />
                {SKILL_5E_LABELS[skill]}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="flex w-20 flex-col gap-1 text-xs">
            AC
            <input
              type="number"
              min={0}
              max={40}
              value={sheet.armorClass}
              onChange={(e) => setSheet({ ...sheet, armorClass: Number(e.target.value) })}
              className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <label className="flex w-24 flex-col gap-1 text-xs">
            HP current
            <input
              type="number"
              min={0}
              value={sheet.hitPointsCurrent}
              onChange={(e) => setSheet({ ...sheet, hitPointsCurrent: Number(e.target.value) })}
              className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <label className="flex w-24 flex-col gap-1 text-xs">
            HP max
            <input
              type="number"
              min={0}
              value={sheet.hitPointsMax}
              onChange={(e) => setSheet({ ...sheet, hitPointsMax: Number(e.target.value) })}
              className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <label className="flex w-24 flex-col gap-1 text-xs">
            Hit dice
            <input
              value={sheet.hitDice}
              onChange={(e) => setSheet({ ...sheet, hitDice: e.target.value })}
              placeholder="3d8"
              className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs">
          Equipment
          <textarea
            value={sheet.equipment}
            onChange={(e) => setSheet({ ...sheet, equipment: e.target.value })}
            rows={3}
            maxLength={2000}
            placeholder="A longsword, a shield, a backpack of adventuring gear..."
            className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
          />
        </label>

        <div>
          <p className="text-xs text-black/60 dark:text-white/60">
            Spell slots (leave at 0 for a non-caster)
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {sheet.spellSlots.map((count, i) => (
              <label key={i} className="flex w-14 flex-col gap-1 text-xs">
                L{i + 1}
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={count}
                  onChange={(e) =>
                    setSheet({
                      ...sheet,
                      spellSlots: sheet.spellSlots.map((c, j) =>
                        j === i ? Number(e.target.value) : c
                      ),
                    })
                  }
                  className="rounded border border-black/20 px-1 py-1 dark:border-white/20 dark:bg-transparent"
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    );
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
          Portrait (emoji)
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
        <div className="flex flex-col gap-1">
          Or upload a picture
          <div className="flex items-center gap-3">
            {form.portraitDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data: URL can't use next/image's optimizer.
              <img
                src={form.portraitDataUrl}
                alt=""
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <span className="text-2xl leading-none">{form.avatarEmoji}</span>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => handlePortraitFile(e.target.files?.[0], form, setForm)}
              aria-label="Upload a character portrait picture"
              className="text-xs"
            />
            {form.portraitDataUrl && (
              <button
                type="button"
                onClick={() => setForm({ ...form, portraitDataUrl: null })}
                className="text-xs underline"
              >
                Remove
              </button>
            )}
          </div>
          <span className="text-xs text-black/60 dark:text-white/60">
            Under {Math.round(MAX_PORTRAIT_FILE_BYTES / 1024)}KB. Takes priority over the emoji above when set.
          </span>
        </div>
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
        {isDnd5eSelected(form) && sheet5eSection(form, setForm)}
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
                  pilotName={c.pilotName}
                  canEndSub
                  onEndSubDone={load}
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
