import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign, setCancelled } from "@/lib/campaigns";
import {
  isCuratedSystemSlug,
  listCuratedSystems,
  getCuratedSystem,
  systemMatchPatterns,
  campaignsForSystem,
} from "@/lib/systems";
import { CURATED_SYSTEMS } from "@/lib/types";

function makeDm(emailPrefix: string) {
  return signUp("DM " + emailPrefix, `${emailPrefix}@example.com`, "testpassword123");
}

describe("curated system lookup", () => {
  it("recognizes every slug in CURATED_SYSTEMS and rejects an unknown one", () => {
    for (const slug of CURATED_SYSTEMS) {
      expect(isCuratedSystemSlug(slug)).toBe(true);
    }
    expect(isCuratedSystemSlug("not-a-real-system")).toBe(false);
  });

  it("lists every curated system with a name, description, and slug, in CURATED_SYSTEMS order", () => {
    const systems = listCuratedSystems();
    expect(systems.map((s) => s.slug)).toEqual([...CURATED_SYSTEMS]);
    for (const system of systems) {
      expect(system.name.length).toBeGreaterThan(0);
      expect(system.description.length).toBeGreaterThan(0);
    }
  });

  it("returns null from getCuratedSystem for an unrecognized slug", () => {
    expect(getCuratedSystem("not-a-real-system")).toBeNull();
  });

  it("returns the full curated entry for a known slug", () => {
    const system = getCuratedSystem("dnd-5e");
    expect(system).not.toBeNull();
    expect(system?.name).toBe("Dungeons & Dragons 5th Edition");
    expect(system?.aliases.length).toBeGreaterThan(0);
  });

  it("resolves match patterns as [name, ...aliases] for a known slug, and null for an unknown one", () => {
    expect(systemMatchPatterns("not-a-real-system")).toBeNull();
    const patterns = systemMatchPatterns("pathfinder-2e");
    expect(patterns).not.toBeNull();
    expect(patterns).toContain("Pathfinder 2nd Edition");
    expect(patterns).toContain("pf2e");
  });
});

describe("campaignsForSystem", () => {
  it("returns null for an unrecognized slug rather than an empty result", () => {
    expect(campaignsForSystem("not-a-real-system")).toBeNull();
  });

  it("matches a campaign whose system is the curated name, case-insensitively", () => {
    const dm = makeDm("sys-name1");
    createCampaign({
      dmId: dm.id,
      title: "Unique Sys Test Name Match",
      description: "",
      system: "dungeons & dragons 5e",
      capacity: 4,
    });
    const result = campaignsForSystem("dnd-5e");
    expect(result).not.toBeNull();
    expect(result!.items.some((c) => c.title === "Unique Sys Test Name Match")).toBe(true);
  });

  it("matches via a curated alias substring embedded in a longer system string", () => {
    const dm = makeDm("sys-alias1");
    createCampaign({
      dmId: dm.id,
      title: "Unique Sys Test Alias Match",
      description: "",
      system: "Homebrew D&D 5e West Marches",
      capacity: 6,
    });
    const result = campaignsForSystem("dnd-5e");
    expect(result!.items.some((c) => c.title === "Unique Sys Test Alias Match")).toBe(true);
  });

  it("does not cross-match a different curated system's campaigns", () => {
    const dm = makeDm("sys-cross1");
    createCampaign({
      dmId: dm.id,
      title: "Unique Sys Test Cross Pathfinder",
      description: "",
      system: "Pathfinder 2E",
      capacity: 4,
    });
    const pf2e = campaignsForSystem("pathfinder-2e");
    const dnd5e = campaignsForSystem("dnd-5e");
    expect(pf2e!.items.some((c) => c.title === "Unique Sys Test Cross Pathfinder")).toBe(true);
    expect(dnd5e!.items.some((c) => c.title === "Unique Sys Test Cross Pathfinder")).toBe(false);
  });

  it("excludes a campaign whose system doesn't match any curated pattern", () => {
    const dm = makeDm("sys-unmatched1");
    createCampaign({
      dmId: dm.id,
      title: "Unique Sys Test Unmatched Fate",
      description: "",
      system: "Fate Core (homebrew hack)",
      capacity: 4,
    });
    for (const slug of CURATED_SYSTEMS) {
      const result = campaignsForSystem(slug);
      expect(result!.items.some((c) => c.title === "Unique Sys Test Unmatched Fate")).toBe(false);
    }
  });

  it("excludes cancelled campaigns, matching listCampaigns' default", () => {
    const dm = makeDm("sys-cancelled1");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "Unique Sys Test Cancelled CoC",
      description: "",
      system: "Call of Cthulhu",
      capacity: 4,
    });
    setCancelled(campaign.id, dm.id, true);
    const result = campaignsForSystem("call-of-cthulhu");
    expect(result!.items.some((c) => c.id === campaign.id)).toBe(false);
  });

  it("paginates while total reflects every match, and sorts newest-first by default", () => {
    const dm = makeDm("sys-page1");
    createCampaign({
      dmId: dm.id,
      title: "Unique Sys Test Page A Vampire",
      description: "",
      system: "Vampire: The Masquerade",
      capacity: 4,
    });
    createCampaign({
      dmId: dm.id,
      title: "Unique Sys Test Page B Vampire",
      description: "",
      system: "Vampire: The Masquerade",
      capacity: 4,
    });
    const full = campaignsForSystem("vampire-masquerade");
    expect(full!.total).toBeGreaterThanOrEqual(2);

    const firstPage = campaignsForSystem("vampire-masquerade", { pageSize: 1, page: 1 });
    expect(firstPage!.items.length).toBe(1);
    expect(firstPage!.total).toBe(full!.total);
    // Newest first: the second-created campaign should come before the first.
    expect(firstPage!.items[0].title).toBe("Unique Sys Test Page B Vampire");
  });
});
