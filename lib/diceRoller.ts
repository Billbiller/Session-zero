/** Pure, DB-free dice-notation parser and roller (backlog #62 -- player-
 * facing D&D learning/utility tools). Split out into its own lib module,
 * same convention as lib/availabilityMatch.ts and lib/calendarExport.ts,
 * so the actual randomness and parsing logic is unit-testable without a
 * browser: the RNG is injectable, and the UI (app/dice/page.tsx) is a
 * thin "use client" wrapper that calls this with the real Math.random.
 */

/** A parsed "NdS+M" / "NdS-M" dice expression, e.g. "2d6+3" ->
 * { count: 2, sides: 6, modifier: 3 }. `count` defaults to 1 when
 * omitted ("d20" -> count 1), `modifier` defaults to 0 when omitted. */
export interface ParsedDiceNotation {
  count: number;
  sides: number;
  modifier: number;
}

/** Upper bounds on count/sides -- not a rules limit, just a sanity cap so
 * a typo like "999999d999999" can't hang the tab rendering that many
 * results. 100 dice and d1000 comfortably covers every real D&D use case
 * (even a large damage roll or a d% roll) with room to spare. */
export const MAX_DICE_COUNT = 100;
export const MAX_DICE_SIDES = 1000;

const NOTATION_RE = /^\s*(\d*)\s*d\s*(\d+)\s*([+-]\s*\d+)?\s*$/i;

/** Parse a dice-notation string. Returns `null` (not a thrown error) for
 * anything malformed or out of the sanity bounds above -- callers (the
 * form) turn that into an inline validation message rather than a crash,
 * the same "no throw for expected-invalid-input" convention as this
 * app's other user-facing parsers (see e.g. lib/calendarExport.ts). */
export function parseDiceNotation(input: string): ParsedDiceNotation | null {
  const match = NOTATION_RE.exec(input);
  if (!match) return null;

  const count = match[1] === "" ? 1 : Number(match[1]);
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[3].replace(/\s+/g, "")) : 0;

  if (count < 1 || count > MAX_DICE_COUNT) return null;
  if (sides < 1 || sides > MAX_DICE_SIDES) return null;

  return { count, sides, modifier };
}

export interface DiceRollResult extends ParsedDiceNotation {
  /** One entry per die, in roll order, each in [1, sides]. */
  rolls: number[];
  /** Sum of `rolls` plus `modifier`. */
  total: number;
}

/** Roll `count` dice of `sides` sides and add `modifier`. `rng` defaults
 * to `Math.random` but is injectable so tests can assert exact output --
 * pass e.g. a function returning a fixed sequence to pin specific rolls. */
export function rollDice(
  { count, sides, modifier }: ParsedDiceNotation,
  rng: () => number = Math.random
): DiceRollResult {
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(rng() * sides) + 1);
  }
  const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;
  return { count, sides, modifier, rolls, total };
}

/** Parse-then-roll in one call, for the common case (the form only ever
 * has a raw notation string, not an already-parsed one). Returns `null`
 * if `input` doesn't parse, same as `parseDiceNotation`. */
export function rollNotation(
  input: string,
  rng: () => number = Math.random
): DiceRollResult | null {
  const parsed = parseDiceNotation(input);
  if (!parsed) return null;
  return rollDice(parsed, rng);
}

/** Canonical re-formatting of a parsed expression back to "NdS+M" text,
 * used both to normalize what the form displays after a roll and in the
 * roll-history list. Always includes `count` (even "1d20", not "d20") so
 * history entries are unambiguous regardless of how the user originally
 * typed the shorthand. */
export function formatDiceNotation({ count, sides, modifier }: ParsedDiceNotation): string {
  const mod = modifier === 0 ? "" : modifier > 0 ? `+${modifier}` : `${modifier}`;
  return `${count}d${sides}${mod}`;
}
