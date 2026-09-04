import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import {
  createCampaign,
  updateCampaign,
  listCampaigns,
  approvedHeadcount,
  setCancelled,
  manualReopen,
  CampaignError,
} from "@/lib/campaigns";
import { requestJoin, approveRequest } from "@/lib/memberships";

function makeDm(email: string) {
  return signUp("DM " + email, email, "testpassword123");
}

describe("campaigns", () => {
  it("creates a campaign with sane defaults", () => {
    const dm = makeDm("dm1@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "Curse of Strahd",
      description: "Gothic horror",
      system: "D&D 5e",
      capacity: 4,
    });
    expect(campaign.accepting_requests).toBe(1);
    expect(campaign.cancelled).toBe(0);
    expect(campaign.capacity).toBe(4);
  });

  it("rejects a non-positive capacity", () => {
    const dm = makeDm("dm2@example.com");
    expect(() =>
      createCampaign({ dmId: dm.id, title: "T", description: "", system: "S", capacity: 0 })
    ).toThrow(CampaignError);
  });

  it("lets the DM edit details", () => {
    const dm = makeDm("dm3@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "Old title",
      description: "",
      system: "S",
      capacity: 4,
    });
    const updated = updateCampaign(campaign.id, dm.id, { title: "New title" });
    expect(updated.title).toBe("New title");
  });

  it("rejects edits from a non-DM", () => {
    const dm = makeDm("dm4@example.com");
    const stranger = signUp("Stranger", "stranger1@example.com", "testpassword123");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    expect(() => updateCampaign(campaign.id, stranger.id, { title: "Hijacked" })).toThrow(
      CampaignError
    );
  });

  it("enforces the capacity floor at the current approved headcount", () => {
    const dm = makeDm("dm5@example.com");
    const p1 = signUp("P1", "p1-floor@example.com", "testpassword123");
    const p2 = signUp("P2", "p2-floor@example.com", "testpassword123");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    const m1 = requestJoin(campaign.id, p1.id);
    approveRequest(m1.id, dm.id);
    const m2 = requestJoin(campaign.id, p2.id);
    approveRequest(m2.id, dm.id);

    expect(approvedHeadcount(campaign.id)).toBe(2);
    expect(() => updateCampaign(campaign.id, dm.id, { capacity: 1 })).toThrow(CampaignError);
    const ok = updateCampaign(campaign.id, dm.id, { capacity: 2 });
    expect(ok.capacity).toBe(2);
  });

  it("filters by exact system match, sorts, and paginates", () => {
    const dm = makeDm("dm6@example.com");
    createCampaign({ dmId: dm.id, title: "A", description: "", system: "Unique Pathfinder 6", capacity: 4 });
    createCampaign({ dmId: dm.id, title: "B", description: "", system: "Unique D&D 5e Six", capacity: 4 });
    createCampaign({ dmId: dm.id, title: "C", description: "", system: "Unique D&D 5e Six", capacity: 4 });

    const filtered = listCampaigns({ system: "Unique D&D 5e Six" });
    expect(filtered.total).toBe(2);
    expect(filtered.items.every((c) => c.system === "Unique D&D 5e Six")).toBe(true);

    const paged = listCampaigns({ pageSize: 1, page: 1 });
    expect(paged.items).toHaveLength(1);

    const byTitle = listCampaigns({ sort: "title" });
    const titles = byTitle.items.map((c) => c.title);
    expect(titles).toEqual([...titles].sort());
  });

  it("excludes cancelled campaigns from the default browse list", () => {
    const dm = makeDm("dm7@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "Cancel me",
      description: "",
      system: "Unique System 7",
      capacity: 4,
    });
    setCancelled(campaign.id, dm.id, true);
    const { items } = listCampaigns({ system: "Unique System 7" });
    expect(items).toHaveLength(0);
  });

  it("searches by free-text keyword across title, description, and system", () => {
    const dm = makeDm("dm-search1@example.com");
    createCampaign({
      dmId: dm.id,
      title: "Curse of the Kwzx7Sunless Citadel",
      description: "A classic low-level kwzx7dungeon crawl.",
      system: "Unique Search System A",
      capacity: 4,
    });
    createCampaign({
      dmId: dm.id,
      title: "Weekly Kwzx7Pathfinder Society",
      description: "Organized play, kwzx7drop-in friendly.",
      system: "Unique Search System B Kwzx7Pathfinder",
      capacity: 6,
    });
    createCampaign({
      dmId: dm.id,
      title: "Unrelated one-shot",
      description: "Nothing to do with dungeons.",
      system: "Unique Search System C",
      capacity: 4,
    });

    const byTitle = listCampaigns({ q: "kwzx7sunless" });
    expect(byTitle.total).toBe(1);
    expect(byTitle.items[0].title).toBe("Curse of the Kwzx7Sunless Citadel");

    const byDescription = listCampaigns({ q: "kwzx7drop-in" });
    expect(byDescription.total).toBe(1);
    expect(byDescription.items[0].title).toBe("Weekly Kwzx7Pathfinder Society");

    const bySystem = listCampaigns({ q: "kwzx7pathfinder" });
    expect(bySystem.total).toBe(1);
    expect(bySystem.items[0].title).toBe("Weekly Kwzx7Pathfinder Society");

    // Case-insensitive.
    const upper = listCampaigns({ q: "KWZX7SUNLESS" });
    expect(upper.total).toBe(1);

    // Combines with the exact system filter (AND, not OR).
    const combined = listCampaigns({
      q: "kwzx7dungeon",
      system: "Unique Search System A",
    });
    expect(combined.total).toBe(1);
    const combinedMiss = listCampaigns({
      q: "kwzx7dungeon",
      system: "Unique Search System B Kwzx7Pathfinder",
    });
    expect(combinedMiss.total).toBe(0);

    // No match.
    expect(listCampaigns({ q: "nonexistent keyword kwzx7zzz" }).total).toBe(0);
  });

  it("treats % and _ in a keyword search as literal characters, not SQL wildcards", () => {
    const dm = makeDm("dm-search2@example.com");
    createCampaign({
      dmId: dm.id,
      title: "50% off session zero swag_bonus",
      description: "",
      system: "Unique Search System D",
      capacity: 4,
    });
    createCampaign({
      dmId: dm.id,
      title: "Totally different campaign",
      description: "",
      system: "Unique Search System E",
      capacity: 4,
    });

    // A literal "%" in the query should only match campaigns containing
    // a literal "%", not act as a wildcard matching everything.
    const percent = listCampaigns({ q: "50%" });
    expect(percent.total).toBe(1);
    expect(percent.items[0].system).toBe("Unique Search System D");

    // A literal "_" should only match a literal underscore, not "any character".
    const underscore = listCampaigns({ q: "swag_bonus" });
    expect(underscore.total).toBe(1);
    const underscoreNoMatch = listCampaigns({ q: "swagXbonus" });
    expect(underscoreNoMatch.total).toBe(0);
  });

  it("lets the DM manually reopen a campaign", () => {
    const dm = makeDm("dm8@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    setCancelled(campaign.id, dm.id, false); // no-op, exercised for coverage
    const reopened = manualReopen(campaign.id, dm.id);
    expect(reopened.accepting_requests).toBe(1);
  });
});
