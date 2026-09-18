import {
  ABILITY_SCORES_5E,
  ABILITY_SCORE_5E_LABELS,
  CHARACTER_STATUS_LABELS,
  SKILLS_5E,
  SKILL_5E_LABELS,
  type Character,
  type Sheet5e,
} from "./types";
import { abilityModifier, formatModifier, savingThrowBonus, skillBonus } from "./sheet5e";

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
  /** Backlog #56: the character's 5e stat block, if it has one --
   * rendered as its own section right after the header, before Bio/
   * Backstory, mirroring where a physical/PDF character sheet puts its
   * stat block relative to roleplay notes. Omitted/null renders nothing
   * extra, so a non-5e character's export is byte-for-byte unchanged. */
  sheet5e?: Sheet5e | null;
}): string {
  const { ownerName, character, linkedCampaignTitle, sheet5e } = params;
  const lines: string[] = [];

  lines.push(character.name || "Unnamed character");
  lines.push("=".repeat((character.name || "Unnamed character").length));
  lines.push("");

  if (character.archetype) lines.push(character.archetype);
  lines.push(`Status: ${CHARACTER_STATUS_LABELS[character.status]}`);
  lines.push(`Player: ${ownerName}`);
  if (linkedCampaignTitle) lines.push(`Campaign: ${linkedCampaignTitle}`);
  lines.push("");

  if (sheet5e) {
    lines.push("5e Stat Block");
    lines.push("-------------");
    lines.push(
      ABILITY_SCORES_5E.map(
        (a) =>
          `${ABILITY_SCORE_5E_LABELS[a].slice(0, 3).toUpperCase()} ${sheet5e.abilityScores[a]} (${formatModifier(abilityModifier(sheet5e.abilityScores[a]))})`
      ).join("  ")
    );
    lines.push(`Proficiency Bonus: ${formatModifier(sheet5e.proficiencyBonus)}`);
    lines.push(
      `AC ${sheet5e.armorClass}  HP ${sheet5e.hitPointsCurrent}/${sheet5e.hitPointsMax}  Hit Dice ${sheet5e.hitDice}`
    );
    lines.push(
      "Saving throws: " +
        (ABILITY_SCORES_5E.map(
          (a) => `${ABILITY_SCORE_5E_LABELS[a].slice(0, 3)} ${formatModifier(savingThrowBonus(sheet5e, a))}`
        ).join(", ") || "none")
    );
    lines.push(
      "Skills: " +
        (SKILLS_5E.filter((s) => sheet5e.skillProficiencies.includes(s))
          .map((s) => `${SKILL_5E_LABELS[s]} ${formatModifier(skillBonus(sheet5e, s))}`)
          .join(", ") || "no proficiencies")
    );
    const spellSlotsText = sheet5e.spellSlots
      .map((count, i) => (count > 0 ? `L${i + 1}: ${count}` : null))
      .filter((s): s is string => s !== null)
      .join(", ");
    if (spellSlotsText) lines.push(`Spell slots: ${spellSlotsText}`);
    if (sheet5e.equipment) {
      lines.push("Equipment:");
      lines.push(sheet5e.equipment);
    }
    lines.push("");
  }

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
