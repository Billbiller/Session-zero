/** Pure, DB-free copy helpers for campaign browse cards (backlog #66 --
 * competitive research vs. StartPlaying.games). Split out into its own
 * tiny lib module, same convention as lib/availabilityMatch.ts and
 * lib/diceRoller.ts, so the phrasing logic is unit-testable without a
 * browser or database.
 *
 * StartPlaying phrases a table's open capacity as urgency-style copy
 * ("2 SEATS LEFT") rather than a plain fraction -- the same underlying
 * number this app already computes via approvedHeadcount()/capacity, just
 * reframed to make a half-full table feel like an active opportunity
 * instead of a static fact. StartPlaying also has a "3 NEEDED TO START"
 * variant, but that depends on a stated *minimum* player count before a
 * table is viable -- a concept this app's data model doesn't have
 * (`capacity` is only ever a maximum) -- so that variant isn't
 * reproduced here; inventing a minimum-players field would be new scope
 * well beyond "a small copy change," the item's own framing.
 *
 * Scoped to browse-card surfaces specifically (the /campaigns list, the
 * Discover deck, and a system hub's campaign list -- all three render
 * the exact same "headcount/capacity players" line today) per the
 * item's own "browse-card copy" title. The single campaign detail page
 * keeps the plain "X/Y players" count -- a viewer already on that page
 * benefits more from the precise number than from urgency framing aimed
 * at getting someone to click through in the first place. */
export function seatsLeftLabel(headcount: number, capacity: number): string {
  const seatsLeft = Math.max(0, capacity - headcount);
  if (seatsLeft === 0) return "Full";
  if (seatsLeft === 1) return "1 seat left";
  return `${seatsLeft} seats left`;
}
