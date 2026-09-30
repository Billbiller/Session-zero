import type { Character } from "./types";

/**
 * Backlog #71 (competitive research vs. StartPlaying.games): a pure,
 * DB-free helper that reduces a campaign's linked characters down to a
 * public "current party" composition preview -- just the aggregate
 * archetype list (e.g. "Human Wizard, Aasimar Cleric"), never names or
 * which real player is behind each, so it can be shown to any viewer,
 * including a signed-out prospective joiner. Same split as
 * lib/upcomingSessions.ts (backlog #70): takes already-fetched character
 * data rather than a campaignId, so it stays "use client"-safe and
 * unit-testable without pulling in better-sqlite3 via lib/db.ts.
 *
 * Every character's full name/archetype/bio/backstory is already public
 * further down the campaign detail page (see
 * lib/characters.ts's listCharactersForCampaign doc comment) -- this is
 * a narrower, scannable digest of just the composition, meant to help a
 * prospective joiner pick a complementary concept *before* they decide
 * whether to request to join.
 */

export interface PartyCompositionEntry {
  /** Display text for this archetype, e.g. "Evocation Wizard Human" --
   * the exact free-text a player entered, trimmed. When multiple linked
   * characters share the same archetype (matched case/whitespace
   * -insensitively), the first one's original casing/spacing is kept as
   * the canonical display text. */
  archetype: string;
  /** How many currently-active linked characters share this archetype. */
  count: number;
}

/**
 * Aggregates a campaign's linked characters into a deduplicated,
 * count-annotated archetype list for public display.
 *
 * - Only characters with status "active" count -- a retired or fallen
 *   character isn't part of the *current* party a prospective joiner
 *   would be joining, matching how getCampaignChronicle (lib/characters.ts)
 *   already distinguishes active/retired/fallen.
 * - A character with a blank or whitespace-only archetype is skipped
 *   entirely rather than showing as an empty/"Unknown" entry -- nothing
 *   meaningful to contribute to the list, matching this app's usual
 *   "don't show a feature with nothing to show" convention.
 * - Duplicate archetypes collapse into one entry with a count (e.g. two
 *   characters both entered as "Human Wizard" become one
 *   { archetype: "Human Wizard", count: 2 } rather than two separate
 *   lines) -- the caller renders this as "2x Human Wizard".
 * - Order is insertion order, i.e. the order `characters` was passed in
 *   (listCharactersForCampaign's own oldest-linked-first order), not
 *   alphabetical -- matching every other list on the campaign page
 *   (roster, characters-at-this-table) rather than imposing a sort the
 *   DM/players didn't choose.
 */
export function summarizePartyComposition(
  characters: Pick<Character, "archetype" | "status">[]
): PartyCompositionEntry[] {
  const entries: PartyCompositionEntry[] = [];
  const indexByKey = new Map<string, number>();

  for (const character of characters) {
    if (character.status !== "active") continue;
    const archetype = character.archetype.trim();
    if (!archetype) continue;
    const key = archetype.toLowerCase();
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, entries.length);
      entries.push({ archetype, count: 1 });
    } else {
      entries[existingIndex].count += 1;
    }
  }

  return entries;
}
