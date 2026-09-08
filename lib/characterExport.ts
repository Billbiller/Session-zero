import { CHARACTER_STATUS_LABELS, type Character } from "./types";

/** Builds a plain-text character sheet for download/printing. Pure and
 * DB-free by design, mirroring lib/calendarExport.ts's buildSessionIcs --
 * it takes plain values rather than a live Character row plus separately
 * resolved owner/campaign names, so the route handler
 * (app/api/characters/[id]/export/route.ts) is the only place that does
 * DB reads; this function only formats what it's given. No access check
 * is needed here or in the route: a character's own fields are already
 * fully public via /players/[id] (see CharacterSummary), so exporting the
 * same fields as plain text exposes nothing new. */
export function buildCharacterSheetText(params: {
  ownerName: string;
  character: Pick<
    Character,
    "name" | "archetype" | "status" | "bio" | "backstory" | "epilogue"
  >;
  linkedCampaignTitle: string | null;
}): string {
  const { ownerName, character, linkedCampaignTitle } = params;
  const lines: string[] = [];

  lines.push(character.name || "Unnamed character");
  lines.push("=".repeat((character.name || "Unnamed character").length));
  lines.push("");

  if (character.archetype) lines.push(character.archetype);
  lines.push(`Status: ${CHARACTER_STATUS_LABELS[character.status]}`);
  lines.push(`Player: ${ownerName}`);
  if (linkedCampaignTitle) lines.push(`Campaign: ${linkedCampaignTitle}`);
  lines.push("");

  if (character.bio) {
    lines.push("Bio");
    lines.push("---");
    lines.push(character.bio);
    lines.push("");
  }

  if (character.backstory) {
    lines.push("Backstory");
    lines.push("---------");
    lines.push(character.backstory);
    lines.push("");
  }

  // Epilogue only makes sense once the character isn't active anymore --
  // mirrors CharacterSummary's own "status !== active && epilogue" guard,
  // so the exported sheet never shows a stray "how it ended" note for a
  // character that's still adventuring.
  if (character.status !== "active" && character.epilogue) {
    lines.push("Epilogue");
    lines.push("--------");
    lines.push(character.epilogue);
    lines.push("");
  }

  lines.push(`Exported from Session Zero on ${new Date().toISOString().slice(0, 10)}`);

  return lines.join("\n");
}
