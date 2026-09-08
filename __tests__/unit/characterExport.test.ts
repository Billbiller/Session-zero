import { describe, it, expect } from "vitest";
import { buildCharacterSheetText } from "@/lib/characterExport";
import type { CharacterStatus } from "@/lib/types";

function makeCharacter(overrides: {
  name?: string;
  archetype?: string;
  status?: CharacterStatus;
  bio?: string;
  backstory?: string;
  epilogue?: string;
} = {}) {
  return {
    name: overrides.name ?? "Elowen Brightwood",
    archetype: overrides.archetype ?? "Level 5 Ranger",
    status: overrides.status ?? "active",
    bio: overrides.bio ?? "A quiet tracker with a sharp eye.",
    backstory: overrides.backstory ?? "Raised at the edge of the Silverwood.",
    epilogue: overrides.epilogue ?? "",
  };
}

describe("buildCharacterSheetText", () => {
  it("includes the character's name as a heading and the player's name", () => {
    const text = buildCharacterSheetText({
      ownerName: "Bill",
      character: makeCharacter(),
      linkedCampaignTitle: null,
    });
    expect(text).toContain("Elowen Brightwood");
    expect(text).toContain("Player: Bill");
  });

  it("includes the archetype, status label, bio, and backstory", () => {
    const text = buildCharacterSheetText({
      ownerName: "Bill",
      character: makeCharacter(),
      linkedCampaignTitle: null,
    });
    expect(text).toContain("Level 5 Ranger");
    expect(text).toContain("Status: Still adventuring");
    expect(text).toContain("A quiet tracker with a sharp eye.");
    expect(text).toContain("Raised at the edge of the Silverwood.");
  });

  it("includes the linked campaign title when given", () => {
    const text = buildCharacterSheetText({
      ownerName: "Bill",
      character: makeCharacter(),
      linkedCampaignTitle: "Curse of Strahd",
    });
    expect(text).toContain("Campaign: Curse of Strahd");
  });

  it("omits the Campaign line entirely when there's no linked campaign", () => {
    const text = buildCharacterSheetText({
      ownerName: "Bill",
      character: makeCharacter(),
      linkedCampaignTitle: null,
    });
    expect(text).not.toContain("Campaign:");
  });

  it("omits the Bio/Backstory sections entirely when those fields are blank", () => {
    const text = buildCharacterSheetText({
      ownerName: "Bill",
      character: makeCharacter({ bio: "", backstory: "" }),
      linkedCampaignTitle: null,
    });
    expect(text).not.toContain("Bio\n---");
    expect(text).not.toContain("Backstory\n---------");
  });

  it("includes the epilogue for a retired character", () => {
    const text = buildCharacterSheetText({
      ownerName: "Bill",
      character: makeCharacter({ status: "retired", epilogue: "Settled down to farm turnips." }),
      linkedCampaignTitle: null,
    });
    expect(text).toContain("Status: Retired");
    expect(text).toContain("Epilogue");
    expect(text).toContain("Settled down to farm turnips.");
  });

  it("includes the epilogue for a fallen character", () => {
    const text = buildCharacterSheetText({
      ownerName: "Bill",
      character: makeCharacter({ status: "fallen", epilogue: "Fell to the dragon's breath." }),
      linkedCampaignTitle: null,
    });
    expect(text).toContain("Status: Fallen");
    expect(text).toContain("Fell to the dragon's breath.");
  });

  it("omits the epilogue for an active character even if the field is set", () => {
    // Mirrors CharacterSummary's own "status !== active && epilogue" guard
    // -- an epilogue can be written in advance before formally retiring.
    const text = buildCharacterSheetText({
      ownerName: "Bill",
      character: makeCharacter({ status: "active", epilogue: "Not dead yet." }),
      linkedCampaignTitle: null,
    });
    expect(text).not.toContain("Not dead yet.");
    expect(text).not.toContain("Epilogue");
  });

  it("falls back to 'Unnamed character' when the name is blank", () => {
    const text = buildCharacterSheetText({
      ownerName: "Bill",
      character: makeCharacter({ name: "" }),
      linkedCampaignTitle: null,
    });
    expect(text).toContain("Unnamed character");
  });

  it("includes an export-date footer line", () => {
    const text = buildCharacterSheetText({
      ownerName: "Bill",
      character: makeCharacter(),
      linkedCampaignTitle: null,
    });
    expect(text).toMatch(/Exported from Session Zero on \d{4}-\d{2}-\d{2}/);
  });
});
