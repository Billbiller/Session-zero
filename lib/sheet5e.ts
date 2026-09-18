import {
  ABILITY_SCORES_5E,
  SKILLS_5E,
  SKILL_5E_ABILITY,
  SPELL_SLOT_LEVELS_5E,
  type AbilityScore5e,
  type Skill5e,
  type Sheet5e,
} from "./types";

/** Deliberately its own error class rather than reusing lib/characters.ts's
 * CharacterError -- this module is pure (no DB import) so it can be
 * imported from a client component (CharacterManager) for live modifier
 * previews as someone types, which a module pulling in better-sqlite3
 * can't be. lib/characters.ts catches this and rethrows as its own
 * CharacterError so callers there only ever see one error type. */
export class Sheet5eError extends Error {}

export const MIN_ABILITY_SCORE = 1;
export const MAX_ABILITY_SCORE = 30;
export const MIN_PROFICIENCY_BONUS = 2;
export const MAX_PROFICIENCY_BONUS = 6;
export const MAX_ARMOR_CLASS = 40;
export const MAX_EQUIPMENT_LENGTH = 2000;
export const MAX_SPELL_SLOTS_PER_LEVEL = 20;

// A generous but real-shaped dice notation: 1-2 digit count, then "d",
// then one of the standard die sizes. Matches "3d8", "1d12", "10d6", etc.
const HIT_DICE_PATTERN = /^[1-9][0-9]?d(4|6|8|10|12|20|100)$/;

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** "+3" / "-1" / "+0" -- 5e's own convention of always showing a sign. */
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function savingThrowBonus(sheet: Sheet5e, ability: AbilityScore5e): number {
  const mod = abilityModifier(sheet.abilityScores[ability]);
  return sheet.savingThrowProficiencies.includes(ability) ? mod + sheet.proficiencyBonus : mod;
}

export function skillBonus(sheet: Sheet5e, skill: Skill5e): number {
  const mod = abilityModifier(sheet.abilityScores[SKILL_5E_ABILITY[skill]]);
  return sheet.skillProficiencies.includes(skill) ? mod + sheet.proficiencyBonus : mod;
}

/** A sane starting point for a brand-new 5e sheet -- every ability at 10
 * (modifier +0), proficiency bonus 2 (a level 1-4 character's), no
 * saving-throw or skill proficiencies checked yet, AC 10, 1 HP, a d8 hit
 * die, no equipment written down, and no spell slots. The create/edit
 * form starts from this and lets the player fill in their actual sheet. */
export function defaultSheet5e(): Sheet5e {
  return {
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    proficiencyBonus: 2,
    savingThrowProficiencies: [],
    skillProficiencies: [],
    armorClass: 10,
    hitPointsMax: 1,
    hitPointsCurrent: 1,
    hitDice: "1d8",
    equipment: "",
    spellSlots: new Array(SPELL_SLOT_LEVELS_5E).fill(0),
  };
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/** Validates and normalizes an arbitrary (client-supplied) value into a
 * real Sheet5e, throwing Sheet5eError with a specific, user-facing
 * message on the first shape/range problem found. Called from both the
 * API route (app/api/characters/**, defense in depth via zod first) and
 * lib/characters.ts (the actual source of truth) per this app's existing
 * double-validation convention already established for portraitDataUrl. */
export function validateSheet5e(value: unknown): Sheet5e {
  if (typeof value !== "object" || value === null) {
    throw new Sheet5eError("A 5e stat block must be an object.");
  }
  const v = value as Record<string, unknown>;

  if (typeof v.abilityScores !== "object" || v.abilityScores === null) {
    throw new Sheet5eError("Ability scores are required.");
  }
  const rawScores = v.abilityScores as Record<string, unknown>;
  const abilityScores = {} as Record<AbilityScore5e, number>;
  for (const ability of ABILITY_SCORES_5E) {
    const score = rawScores[ability];
    if (!isInt(score) || score < MIN_ABILITY_SCORE || score > MAX_ABILITY_SCORE) {
      throw new Sheet5eError(
        `${ability.toUpperCase()} must be a whole number between ${MIN_ABILITY_SCORE} and ${MAX_ABILITY_SCORE}.`
      );
    }
    abilityScores[ability] = score;
  }

  const proficiencyBonus = v.proficiencyBonus;
  if (
    !isInt(proficiencyBonus) ||
    proficiencyBonus < MIN_PROFICIENCY_BONUS ||
    proficiencyBonus > MAX_PROFICIENCY_BONUS
  ) {
    throw new Sheet5eError(
      `Proficiency bonus must be a whole number between ${MIN_PROFICIENCY_BONUS} and ${MAX_PROFICIENCY_BONUS}.`
    );
  }

  const savingThrowProficiencies = Array.isArray(v.savingThrowProficiencies)
    ? (v.savingThrowProficiencies.filter((a) =>
        (ABILITY_SCORES_5E as readonly string[]).includes(a as string)
      ) as AbilityScore5e[])
    : [];
  const skillProficiencies = Array.isArray(v.skillProficiencies)
    ? (v.skillProficiencies.filter((s) =>
        (SKILLS_5E as readonly string[]).includes(s as string)
      ) as Skill5e[])
    : [];

  const armorClass = v.armorClass;
  if (!isInt(armorClass) || armorClass < 0 || armorClass > MAX_ARMOR_CLASS) {
    throw new Sheet5eError(`Armor class must be a whole number between 0 and ${MAX_ARMOR_CLASS}.`);
  }
  const hitPointsMax = v.hitPointsMax;
  if (!isInt(hitPointsMax) || hitPointsMax < 0) {
    throw new Sheet5eError("Max hit points must be a non-negative whole number.");
  }
  const hitPointsCurrent = v.hitPointsCurrent;
  if (!isInt(hitPointsCurrent) || hitPointsCurrent < 0) {
    throw new Sheet5eError("Current hit points must be a non-negative whole number.");
  }
  const hitDice = typeof v.hitDice === "string" ? v.hitDice.trim() : "";
  if (!HIT_DICE_PATTERN.test(hitDice)) {
    throw new Sheet5eError('Hit dice must look like "3d8".');
  }
  const equipment = typeof v.equipment === "string" ? v.equipment.trim() : "";
  if (equipment.length > MAX_EQUIPMENT_LENGTH) {
    throw new Sheet5eError(`Equipment list can't be longer than ${MAX_EQUIPMENT_LENGTH} characters.`);
  }
  const spellSlots = v.spellSlots;
  if (
    !Array.isArray(spellSlots) ||
    spellSlots.length !== SPELL_SLOT_LEVELS_5E ||
    !spellSlots.every((n) => isInt(n) && n >= 0 && n <= MAX_SPELL_SLOTS_PER_LEVEL)
  ) {
    throw new Sheet5eError(
      `Spell slots must be exactly ${SPELL_SLOT_LEVELS_5E} whole numbers (one per spell level, 1st through 9th), each between 0 and ${MAX_SPELL_SLOTS_PER_LEVEL}.`
    );
  }

  return {
    abilityScores,
    proficiencyBonus,
    savingThrowProficiencies,
    skillProficiencies,
    armorClass,
    hitPointsMax,
    hitPointsCurrent,
    hitDice,
    equipment,
    spellSlots: spellSlots as number[],
  };
}
