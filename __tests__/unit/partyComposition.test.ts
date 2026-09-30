import { describe, it, expect } from "vitest";
import { summarizePartyComposition } from "@/lib/partyComposition";
import type { Character } from "@/lib/types";

function character(archetype: string, status: Character["status"] = "active") {
  return { archetype, status };
}

describe("summarizePartyComposition", () => {
  it("returns an empty list for no characters", () => {
    expect(summarizePartyComposition([])).toEqual([]);
  });

  it("lists each distinct archetype once, in first-seen order", () => {
    const result = summarizePartyComposition([
      character("Evocation Wizard Human"),
      character("Light Cleric Aasimar"),
    ]);
    expect(result).toEqual([
      { archetype: "Evocation Wizard Human", count: 1 },
      { archetype: "Light Cleric Aasimar", count: 1 },
    ]);
  });

  it("collapses duplicate archetypes into one entry with a count", () => {
    const result = summarizePartyComposition([
      character("Human Wizard"),
      character("Human Wizard"),
      character("Aasimar Cleric"),
    ]);
    expect(result).toEqual([
      { archetype: "Human Wizard", count: 2 },
      { archetype: "Aasimar Cleric", count: 1 },
    ]);
  });

  it("matches duplicates case- and whitespace-insensitively, keeping the first casing seen", () => {
    const result = summarizePartyComposition([
      character("Human Wizard"),
      character("  human wizard  "),
    ]);
    expect(result).toEqual([{ archetype: "Human Wizard", count: 2 }]);
  });

  it("excludes retired and fallen characters -- only the current, active party counts", () => {
    const result = summarizePartyComposition([
      character("Human Wizard", "active"),
      character("Elf Ranger", "retired"),
      character("Dwarf Fighter", "fallen"),
    ]);
    expect(result).toEqual([{ archetype: "Human Wizard", count: 1 }]);
  });

  it("skips characters with a blank or whitespace-only archetype", () => {
    const result = summarizePartyComposition([
      character(""),
      character("   "),
      character("Human Wizard"),
    ]);
    expect(result).toEqual([{ archetype: "Human Wizard", count: 1 }]);
  });

  it("returns an empty list when nothing active has a usable archetype", () => {
    expect(
      summarizePartyComposition([character(""), character("Elf Ranger", "retired")])
    ).toEqual([]);
  });
});
