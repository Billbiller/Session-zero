"use client";

// Backlog #62: player-facing D&D learning/utility tools. First tool
// picked: a dice roller -- listed first among the item's own examples,
// and genuinely useful at the table (initiative, damage, ability checks)
// without needing any new schema or sign-in. All parsing/rolling logic
// lives in lib/diceRoller.ts so it's unit-testable; this page is a thin
// client wrapper around it, same split as DiscoverDeck.tsx/
// lib/availabilityMatch.ts.
//
// Not tied to a signed-in user or any campaign -- rolls aren't saved
// anywhere (no "roll history in the party notes" feature here), so
// there's nothing to persist and no access-control question. If a future
// session wants to log a roll into a specific campaign's session log,
// that's a distinct, larger feature (touches lib/sessionLog.ts and this
// tool would need a campaign-picker) -- noted as a follow-on idea in
// backlog #62 rather than built here.

import { useState } from "react";
import {
  formatDiceNotation,
  rollNotation,
  type DiceRollResult,
} from "@/lib/diceRoller";

const PRESETS = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];

const MAX_HISTORY = 20;

export default function DicePage() {
  const [notation, setNotation] = useState("d20");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<DiceRollResult[]>([]);

  function roll(input: string) {
    const result = rollNotation(input);
    if (!result) {
      setError(
        `"${input}" isn't a dice expression I understand -- try something like "2d6+3" or "d20".`
      );
      return;
    }
    setError(null);
    setNotation(formatDiceNotation(result));
    setHistory((prev) => [result, ...prev].slice(0, MAX_HISTORY));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    roll(notation);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Dice roller</h1>
        <p className="mt-1 max-w-2xl text-sm text-black/60 dark:text-white/60">
          Roll standard dice notation (e.g. <code>2d6+3</code>, <code>d20</code>,
          <code> 4d8-2</code>) for ability checks, attacks, damage, or anything
          else your table needs a quick roll for. Nothing here is saved to a
          campaign -- it&apos;s just a scratch-pad roller.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => roll(preset)}
            className="rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/20 dark:bg-transparent"
          >
            {preset}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="notation" className="text-sm font-medium">
            Custom roll
          </label>
          <input
            id="notation"
            type="text"
            value={notation}
            onChange={(e) => setNotation(e.target.value)}
            placeholder="e.g. 2d6+3"
            className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
          />
        </div>
        <button
          type="submit"
          className="mt-6 rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Roll
        </button>
      </form>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {history.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Results</h2>
          <ul className="flex flex-col gap-2">
            {history.map((result, i) => (
              <li
                key={i}
                className="rounded-lg border border-black/10 p-4 dark:border-white/10"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{formatDiceNotation(result)}</span>
                  <span className="text-2xl font-bold">{result.total}</span>
                </div>
                <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                  {result.rolls.join(", ")}
                  {result.modifier !== 0 &&
                    ` ${result.modifier > 0 ? "+" : "-"} ${Math.abs(result.modifier)}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
