import { describe, it, expect } from "vitest";
import {
  abilityModifier,
  formatModifier,
  savingThrowBonus,
  skillBonus,
  defaultSheet5e,
  validateSheet5e,
  Sheet5eError,
} from "@/lib/sheet5e";
import type { Sheet5e } from "@/lib/types";

function makeSheet(overrides: Partial<Sheet5e> = {}): Sheet5e {
  return { ...defaultSheet5e(), ...overrides };
}

describe("abilityModifier / formatModifier", () => {
  it("computes the standard 5e ability modifier table", () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(12)).toBe(1);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(20)).toBe(5);
    expect(abilityModifier(1)).toBe(-5);
  });

  it("always shows a sign, including for zero", () => {
    expect(formatModifier(0)).toBe("+0");
    expect(formatModifier(3)).toBe("+3");
    expect(formatModifier(-2)).toBe("-2");
  });
});

describe("savingThrowBonus / skillBonus", () => {
  it("gives just the ability modifier when not proficient", () => {
    const sheet = makeSheet({ abilityScores: { ...defaultSheet5e().abilityScores, dex: 14 } });
    expect(savingThrowBonus(sheet, "dex")).toBe(2);
    expect(skillBonus(sheet, "stealth")).toBe(2); // stealth is governed by dex
  });

  it("adds the proficiency bonus when proficient", () => {
    const sheet = makeSheet({
      abilityScores: { ...defaultSheet5e().abilityScores, dex: 14 },
      proficiencyBonus: 3,
      savingThrowProficiencies: ["dex"],
      skillProficiencies: ["stealth"],
    });
    expect(savingThrowBonus(sheet, "dex")).toBe(5);
    expect(skillBonus(sheet, "stealth")).toBe(5);
    // A different, non-proficient skill governed by the same ability
    // still only gets the raw modifier.
    expect(skillBonus(sheet, "sleight_of_hand")).toBe(2);
  });
});

describe("defaultSheet5e", () => {
  it("returns a sheet that itself passes validateSheet5e unchanged", () => {
    const sheet = defaultSheet5e();
    expect(() => validateSheet5e(sheet)).not.toThrow();
    expect(sheet.spellSlots).toHaveLength(9);
    expect(sheet.spellSlots.every((n) => n === 0)).toBe(true);
  });
});

describe("validateSheet5e", () => {
  it("accepts a fully-specified valid sheet and returns it normalized", () => {
    const input = {
      abilityScores: { str: 16, dex: 14, con: 15, int: 8, wis: 12, cha: 10 },
      proficiencyBonus: 3,
      savingThrowProficiencies: ["str", "con"],
      skillProficiencies: ["athletics", "perception"],
      armorClass: 16,
      hitPointsMax: 32,
      hitPointsCurrent: 20,
      hitDice: "4d10",
      equipment: "A longsword, chainmail, a backpack.",
      spellSlots: [4, 3, 2, 0, 0, 0, 0, 0, 0],
    };
    const result = validateSheet5e(input);
    expect(result.abilityScores.str).toBe(16);
    expect(result.hitDice).toBe("4d10");
    expect(result.spellSlots).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
  });

  it("trims hitDice and equipment", () => {
    const result = validateSheet5e({
      ...defaultSheet5e(),
      hitDice: "  3d8  ",
      equipment: "  a rope  ",
    });
    expect(result.hitDice).toBe("3d8");
    expect(result.equipment).toBe("a rope");
  });

  it("silently drops unrecognized saving-throw/skill entries rather than throwing", () => {
    const result = validateSheet5e({
      ...defaultSheet5e(),
      savingThrowProficiencies: ["dex", "not-a-real-ability"],
      skillProficiencies: ["stealth", "not-a-real-skill"],
    });
    expect(result.savingThrowProficiencies).toEqual(["dex"]);
    expect(result.skillProficiencies).toEqual(["stealth"]);
  });

  it("rejects a non-object value", () => {
    expect(() => validateSheet5e(null)).toThrow(Sheet5eError);
    expect(() => validateSheet5e("nope")).toThrow(Sheet5eError);
  });

  it("rejects an out-of-range or non-integer ability score", () => {
    expect(() =>
      validateSheet5e({ ...defaultSheet5e(), abilityScores: { ...defaultSheet5e().abilityScores, str: 31 } })
    ).toThrow(Sheet5eError);
    expect(() =>
      validateSheet5e({ ...defaultSheet5e(), abilityScores: { ...defaultSheet5e().abilityScores, str: 0 } })
    ).toThrow(Sheet5eError);
    expect(() =>
      validateSheet5e({ ...defaultSheet5e(), abilityScores: { ...defaultSheet5e().abilityScores, str: 10.5 } })
    ).toThrow(Sheet5eError);
  });

  it("rejects a proficiency bonus outside 2-6", () => {
    expect(() => validateSheet5e({ ...defaultSheet5e(), proficiencyBonus: 1 })).toThrow(Sheet5eError);
    expect(() => validateSheet5e({ ...defaultSheet5e(), proficiencyBonus: 7 })).toThrow(Sheet5eError);
  });

  it("rejects a malformed hit dice string", () => {
    expect(() => validateSheet5e({ ...defaultSheet5e(), hitDice: "3d7" })).toThrow(Sheet5eError);
    expect(() => validateSheet5e({ ...defaultSheet5e(), hitDice: "d8" })).toThrow(Sheet5eError);
    expect(() => validateSheet5e({ ...defaultSheet5e(), hitDice: "" })).toThrow(Sheet5eError);
  });

  it("rejects negative or non-integer hit points", () => {
    expect(() => validateSheet5e({ ...defaultSheet5e(), hitPointsMax: -1 })).toThrow(Sheet5eError);
    expect(() => validateSheet5e({ ...defaultSheet5e(), hitPointsCurrent: -1 })).toThrow(Sheet5eError);
  });

  it("rejects an equipment string over the length limit", () => {
    expect(() => validateSheet5e({ ...defaultSheet5e(), equipment: "x".repeat(2001) })).toThrow(
      Sheet5eError
    );
  });

  it("rejects spellSlots with the wrong length or an out-of-range entry", () => {
    expect(() => validateSheet5e({ ...defaultSheet5e(), spellSlots: [0, 0, 0] })).toThrow(Sheet5eError);
    expect(() =>
      validateSheet5e({ ...defaultSheet5e(), spellSlots: [21, 0, 0, 0, 0, 0, 0, 0, 0] })
    ).toThrow(Sheet5eError);
    expect(() =>
      validateSheet5e({ ...defaultSheet5e(), spellSlots: [-1, 0, 0, 0, 0, 0, 0, 0, 0] })
    ).toThrow(Sheet5eError);
  });

  it("rejects an out-of-range armor class", () => {
    expect(() => validateSheet5e({ ...defaultSheet5e(), armorClass: -1 })).toThrow(Sheet5eError);
    expect(() => validateSheet5e({ ...defaultSheet5e(), armorClass: 41 })).toThrow(Sheet5eError);
  });
});
