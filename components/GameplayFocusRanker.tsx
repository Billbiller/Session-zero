"use client";

import { GAMEPLAY_PILLARS, GAMEPLAY_PILLAR_LABELS, type GameplayPillar } from "@/lib/types";

/** Backlog #64 (owner-requested, live session): shared editable control
 * for a GameplayFocusRanking -- used on the campaign-creation form,
 * DmControls' campaign-edit form, and the profile-edit form, so this was
 * extracted the same way Section.tsx's own doc comment describes (a
 * pattern repeated across three files, once it landed in a third place).
 * No drag-and-drop -- move-up/move-down buttons, the same convention this
 * app's initiative tracker already established for DM-facing reordering.
 * `value` is either empty (unranked) or a full GAMEPLAY_PILLARS-length
 * permutation; toggling the checkbox below seeds a default order rather
 * than requiring the caller to know one. */
export default function GameplayFocusRanker({
  value,
  onChange,
  label = "Gameplay focus (rank, most important first)",
}: {
  value: GameplayPillar[];
  onChange: (next: GameplayPillar[]) => void;
  label?: string;
}) {
  const ranked = value.length === GAMEPLAY_PILLARS.length ? value : [];

  function enable(checked: boolean) {
    onChange(checked ? [...GAMEPLAY_PILLARS] : []);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= ranked.length) return;
    const next = [...ranked];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <fieldset className="flex flex-col gap-1.5 text-sm">
      <legend>{label}</legend>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={ranked.length > 0} onChange={(e) => enable(e.target.checked)} />
        Rank these
      </label>
      {ranked.length > 0 && (
        <ol className="flex flex-col gap-1">
          {ranked.map((pillar, index) => (
            <li
              key={pillar}
              className="flex items-center justify-between gap-2 rounded border border-black/10 px-2 py-1 dark:border-white/10"
            >
              <span>
                {index + 1}. {GAMEPLAY_PILLAR_LABELS[pillar]}
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Move ${GAMEPLAY_PILLAR_LABELS[pillar]} up`}
                  className="rounded border border-black/20 px-1.5 disabled:opacity-30 dark:border-white/20"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === ranked.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Move ${GAMEPLAY_PILLAR_LABELS[pillar]} down`}
                  className="rounded border border-black/20 px-1.5 disabled:opacity-30 dark:border-white/20"
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </fieldset>
  );
}
