/** Pure, DB-free copy helper for backlog #73's DM responsiveness
 * display (competitive research vs. StartPlaying.games, whose GM cards
 * show phrasing like "Average response time: Under 1 hour" rather than
 * a raw decimal). Split out into its own tiny lib module, same
 * convention as lib/campaignCardCopy.ts/lib/availabilityMatch.ts/
 * lib/diceRoller.ts, so the phrasing logic is unit-testable without a
 * browser or database. See lib/memberships.ts's
 * getDmResponsivenessStats for where the raw `averageResponseHours`
 * number itself comes from. */
export function formatResponseTime(hours: number): string {
  if (hours < 1) return "Under 1 hour";
  if (hours < 24) {
    const rounded = Math.round(hours);
    return `${rounded} hour${rounded === 1 ? "" : "s"}`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}
