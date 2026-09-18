import {
  ABILITY_SCORES_5E,
  ABILITY_SCORE_5E_LABELS,
  SKILLS_5E,
  SKILL_5E_LABELS,
  type Sheet5e,
} from "@/lib/types";
import { abilityModifier, formatModifier, savingThrowBonus, skillBonus } from "@/lib/sheet5e";

/** Backlog #56: read-only presentational display of a character's full
 * 5e stat block -- used only on the dedicated character-sheet page
 * (app/characters/[id]/page.tsx), not the compact CharacterSummary card
 * used everywhere else, since a full stat block is exactly the kind of
 * detail that page exists to show without cluttering every other list
 * a character appears in (profile, campaign roster, public player page).
 * Server-component-safe (no "use client", no hooks) so it renders
 * directly into that page's server-rendered HTML. */
export default function Sheet5eSummary({ sheet }: { sheet: Sheet5e }) {
  const provenSkills = SKILLS_5E.filter((skill) => sheet.skillProficiencies.includes(skill));
  const spellSlotEntries = sheet.spellSlots
    .map((count, i) => ({ level: i + 1, count }))
    .filter((entry) => entry.count > 0);

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-black/10 pt-3 text-sm dark:border-white/10">
      <p className="font-medium">5e stat block</p>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ABILITY_SCORES_5E.map((ability) => (
          <div key={ability} className="rounded border border-black/10 p-2 text-center dark:border-white/10">
            <p className="text-xs text-black/60 dark:text-white/60">
              {ABILITY_SCORE_5E_LABELS[ability].slice(0, 3).toUpperCase()}
            </p>
            <p className="font-medium">{sheet.abilityScores[ability]}</p>
            <p className="text-xs text-black/60 dark:text-white/60">
              {formatModifier(abilityModifier(sheet.abilityScores[ability]))}
            </p>
          </div>
        ))}
      </div>

      <p>
        Proficiency bonus {formatModifier(sheet.proficiencyBonus)} &middot; AC {sheet.armorClass} &middot; HP{" "}
        {sheet.hitPointsCurrent}/{sheet.hitPointsMax} &middot; Hit dice {sheet.hitDice}
      </p>

      <p>
        <span className="text-black/60 dark:text-white/60">Saving throws: </span>
        {ABILITY_SCORES_5E.map(
          (ability) => `${ABILITY_SCORE_5E_LABELS[ability].slice(0, 3)} ${formatModifier(savingThrowBonus(sheet, ability))}`
        ).join(", ")}
      </p>

      <p>
        <span className="text-black/60 dark:text-white/60">Skill proficiencies: </span>
        {provenSkills.length > 0
          ? provenSkills.map((skill) => `${SKILL_5E_LABELS[skill]} ${formatModifier(skillBonus(sheet, skill))}`).join(", ")
          : "none"}
      </p>

      {spellSlotEntries.length > 0 && (
        <p>
          <span className="text-black/60 dark:text-white/60">Spell slots: </span>
          {spellSlotEntries.map((entry) => `L${entry.level}: ${entry.count}`).join(", ")}
        </p>
      )}

      {sheet.equipment && (
        <div>
          <p className="text-black/60 dark:text-white/60">Equipment</p>
          <p className="whitespace-pre-wrap">{sheet.equipment}</p>
        </div>
      )}
    </div>
  );
}
