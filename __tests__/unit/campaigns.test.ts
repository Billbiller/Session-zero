import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import {
  createCampaign,
  getCampaign,
  updateCampaign,
  listCampaigns,
  approvedHeadcount,
  setCancelled,
  manualReopen,
  CampaignError,
  CAMPAIGN_TONE_TAGS,
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

  it("defaults a new campaign's danger level to null", () => {
    const dm = makeDm("dm9@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    expect(campaign.danger_level).toBeNull();
  });

  it("lets the DM set, change, and clear the danger level", () => {
    const dm = makeDm("dm10@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });

    const set = updateCampaign(campaign.id, dm.id, { dangerLevel: "deadly-osr" });
    expect(set.danger_level).toBe("deadly-osr");

    const changed = updateCampaign(campaign.id, dm.id, { dangerLevel: "low-lethality" });
    expect(changed.danger_level).toBe("low-lethality");

    const cleared = updateCampaign(campaign.id, dm.id, { dangerLevel: null });
    expect(cleared.danger_level).toBeNull();
  });

  it("leaves the danger level untouched when omitted from an update", () => {
    const dm = makeDm("dm11@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    updateCampaign(campaign.id, dm.id, { dangerLevel: "moderate" });
    const updated = updateCampaign(campaign.id, dm.id, { title: "New title" });
    expect(updated.danger_level).toBe("moderate");
  });

  it("defaults a new campaign's location to an empty string and lets it be set/updated", () => {
    const dm = makeDm("dm12@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    expect(campaign.location).toBe("");

    const withLocation = createCampaign({
      dmId: dm.id,
      title: "T2",
      description: "",
      system: "S",
      capacity: 4,
      location: "  Austin, TX  ",
    });
    expect(withLocation.location).toBe("Austin, TX");

    const updated = updateCampaign(campaign.id, dm.id, { location: "Online/Remote" });
    expect(updated.location).toBe("Online/Remote");
  });

  it("filters listed campaigns by a case-insensitive substring match on location", () => {
    const dm = makeDm("dm13@example.com");
    createCampaign({
      dmId: dm.id,
      title: "Austin Game",
      description: "",
      system: "Unique Location System A",
      capacity: 4,
      location: "Austin, TX",
    });
    createCampaign({
      dmId: dm.id,
      title: "Denver Game",
      description: "",
      system: "Unique Location System A",
      capacity: 4,
      location: "Denver, CO",
    });
    createCampaign({
      dmId: dm.id,
      title: "Remote Game",
      description: "",
      system: "Unique Location System A",
      capacity: 4,
      location: "Online/Remote",
    });

    const austin = listCampaigns({ system: "Unique Location System A", location: "austin" });
    expect(austin.total).toBe(1);
    expect(austin.items[0].title).toBe("Austin Game");

    const online = listCampaigns({ system: "Unique Location System A", location: "online" });
    expect(online.total).toBe(1);
    expect(online.items[0].title).toBe("Remote Game");

    const none = listCampaigns({ system: "Unique Location System A", location: "nowhere" });
    expect(none.total).toBe(0);
  });

  it("defaults a new campaign's new_player_friendly flag to false and lets it be set on create", () => {
    const dm = makeDm("dm14@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    expect(campaign.new_player_friendly).toBe(0);

    const friendly = createCampaign({
      dmId: dm.id,
      title: "T2",
      description: "",
      system: "S",
      capacity: 4,
      newPlayerFriendly: true,
    });
    expect(friendly.new_player_friendly).toBe(1);
  });

  it("lets the DM set and clear the new_player_friendly flag via update", () => {
    const dm = makeDm("dm15@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });

    const set = updateCampaign(campaign.id, dm.id, { newPlayerFriendly: true });
    expect(set.new_player_friendly).toBe(1);

    const cleared = updateCampaign(campaign.id, dm.id, { newPlayerFriendly: false });
    expect(cleared.new_player_friendly).toBe(0);
  });

  it("leaves new_player_friendly untouched when omitted from an update", () => {
    const dm = makeDm("dm16@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
      newPlayerFriendly: true,
    });
    const updated = updateCampaign(campaign.id, dm.id, { title: "New title" });
    expect(updated.new_player_friendly).toBe(1);
  });

  it("filters listed campaigns to only those flagged new-player-friendly", () => {
    const dm = makeDm("dm17@example.com");
    createCampaign({
      dmId: dm.id,
      title: "Friendly Game",
      description: "",
      system: "Unique NPF System A",
      capacity: 4,
      newPlayerFriendly: true,
    });
    createCampaign({
      dmId: dm.id,
      title: "Regular Game",
      description: "",
      system: "Unique NPF System A",
      capacity: 4,
    });

    const all = listCampaigns({ system: "Unique NPF System A" });
    expect(all.total).toBe(2);

    const friendlyOnly = listCampaigns({
      system: "Unique NPF System A",
      newPlayerFriendly: true,
    });
    expect(friendlyOnly.total).toBe(1);
    expect(friendlyOnly.items[0].title).toBe("Friendly Game");
  });

  // Backlog #41 phase 1: structural in-person/remote/hybrid field.
  it("defaults a new campaign's session_format to null and lets it be set on create", () => {
    const dm = makeDm("dm18@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    expect(campaign.session_format).toBeNull();

    const inPerson = createCampaign({
      dmId: dm.id,
      title: "T2",
      description: "",
      system: "S",
      capacity: 4,
      sessionFormat: "in_person",
    });
    expect(inPerson.session_format).toBe("in_person");
  });

  it("rejects an unrecognized session format on create", () => {
    const dm = makeDm("dm19@example.com");
    expect(() =>
      createCampaign({
        dmId: dm.id,
        title: "T",
        description: "",
        system: "S",
        capacity: 4,
        // @ts-expect-error deliberately invalid for this test
        sessionFormat: "spaceship",
      })
    ).toThrow(CampaignError);
  });

  it("lets the DM set, change, and clear session_format via update", () => {
    const dm = makeDm("dm20@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });

    const set = updateCampaign(campaign.id, dm.id, { sessionFormat: "remote" });
    expect(set.session_format).toBe("remote");

    const changed = updateCampaign(campaign.id, dm.id, { sessionFormat: "hybrid" });
    expect(changed.session_format).toBe("hybrid");

    const cleared = updateCampaign(campaign.id, dm.id, { sessionFormat: null });
    expect(cleared.session_format).toBeNull();
  });

  it("rejects an unrecognized session format on update", () => {
    const dm = makeDm("dm21@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    expect(() =>
      // @ts-expect-error deliberately invalid for this test
      updateCampaign(campaign.id, dm.id, { sessionFormat: "spaceship" })
    ).toThrow(CampaignError);
  });

  it("leaves session_format untouched when omitted from an update", () => {
    const dm = makeDm("dm22@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
      sessionFormat: "in_person",
    });
    const updated = updateCampaign(campaign.id, dm.id, { title: "New title" });
    expect(updated.session_format).toBe("in_person");
  });

  it("filters listed campaigns by an exact session_format match without excluding other formats from the count", () => {
    const dm = makeDm("dm23@example.com");
    createCampaign({
      dmId: dm.id,
      title: "In Person Game",
      description: "",
      system: "Unique SF System A",
      capacity: 4,
      sessionFormat: "in_person",
    });
    createCampaign({
      dmId: dm.id,
      title: "Remote Game",
      description: "",
      system: "Unique SF System A",
      capacity: 4,
      sessionFormat: "remote",
    });

    const all = listCampaigns({ system: "Unique SF System A" });
    expect(all.total).toBe(2);

    const remoteOnly = listCampaigns({
      system: "Unique SF System A",
      sessionFormat: "remote",
    });
    expect(remoteOnly.total).toBe(1);
    expect(remoteOnly.items[0].title).toBe("Remote Game");
  });

  it("ranks in-person campaigns ahead of remote/hybrid/unset ones by default, without excluding any of them", () => {
    const dm = makeDm("dm24@example.com");
    const sys = "Unique Ranking System B";
    // Deliberately created in an order that would put "Remote" first under
    // plain newest-first sort if the format ranking didn't apply.
    createCampaign({
      dmId: dm.id,
      title: "Remote",
      description: "",
      system: sys,
      capacity: 4,
      sessionFormat: "remote",
    });
    createCampaign({
      dmId: dm.id,
      title: "Unset",
      description: "",
      system: sys,
      capacity: 4,
    });
    createCampaign({
      dmId: dm.id,
      title: "Hybrid",
      description: "",
      system: sys,
      capacity: 4,
      sessionFormat: "hybrid",
    });
    createCampaign({
      dmId: dm.id,
      title: "In Person",
      description: "",
      system: sys,
      capacity: 4,
      sessionFormat: "in_person",
    });

    const { items, total } = listCampaigns({ system: sys, sort: "newest" });
    // Ranking is a re-order, not a filter -- every campaign is still here.
    // Within the tied "not in-person" bucket (Remote and Unset), the
    // secondary newest-first sort still applies -- Unset was created
    // after Remote, so it ranks first among the two.
    expect(total).toBe(4);
    expect(items.map((c) => c.title)).toEqual(["In Person", "Hybrid", "Unset", "Remote"]);
  });

  it("preserves the existing newest/oldest/title sort order when no campaign has a session_format set", () => {
    const dm = makeDm("dm25@example.com");
    const sys = "Unique Ranking System C";
    createCampaign({ dmId: dm.id, title: "Zebra", description: "", system: sys, capacity: 4 });
    createCampaign({ dmId: dm.id, title: "Apple", description: "", system: sys, capacity: 4 });
    createCampaign({ dmId: dm.id, title: "Mango", description: "", system: sys, capacity: 4 });

    const byTitle = listCampaigns({ system: sys, sort: "title" });
    expect(byTitle.items.map((c) => c.title)).toEqual(["Apple", "Mango", "Zebra"]);

    const newest = listCampaigns({ system: sys, sort: "newest" });
    expect(newest.items.map((c) => c.title)).toEqual(["Mango", "Apple", "Zebra"]);
  });

  // Backlog #30: free-text starting level.
  it("defaults a new campaign's starting_level to null and lets it be set on create", () => {
    const dm = makeDm("dm26@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    expect(campaign.starting_level).toBeNull();

    const leveled = createCampaign({
      dmId: dm.id,
      title: "T2",
      description: "",
      system: "S",
      capacity: 4,
      startingLevel: "  Level 3  ",
    });
    expect(leveled.starting_level).toBe("Level 3");
  });

  it("rejects an over-length starting_level on create", () => {
    const dm = makeDm("dm27@example.com");
    expect(() =>
      createCampaign({
        dmId: dm.id,
        title: "T",
        description: "",
        system: "S",
        capacity: 4,
        startingLevel: "x".repeat(101),
      })
    ).toThrow(CampaignError);
  });

  it("lets the DM set, change, and clear starting_level via update", () => {
    const dm = makeDm("dm28@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });

    const set = updateCampaign(campaign.id, dm.id, { startingLevel: "Tier 2" });
    expect(set.starting_level).toBe("Tier 2");

    const changed = updateCampaign(campaign.id, dm.id, { startingLevel: "Level 10" });
    expect(changed.starting_level).toBe("Level 10");

    const cleared = updateCampaign(campaign.id, dm.id, { startingLevel: null });
    expect(cleared.starting_level).toBeNull();

    const clearedByBlank = updateCampaign(campaign.id, dm.id, { startingLevel: "  " });
    expect(clearedByBlank.starting_level).toBeNull();
  });

  it("rejects an over-length starting_level on update", () => {
    const dm = makeDm("dm29@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    expect(() =>
      updateCampaign(campaign.id, dm.id, { startingLevel: "x".repeat(101) })
    ).toThrow(CampaignError);
  });

  it("leaves starting_level untouched when omitted from an update", () => {
    const dm = makeDm("dm30@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
      startingLevel: "Level 5",
    });
    const updated = updateCampaign(campaign.id, dm.id, { title: "New title" });
    expect(updated.starting_level).toBe("Level 5");
  });

  // Backlog #30: curated multi-select tone/style tags.
  it("defaults a new campaign's tone_tags to an empty array and lets it be set on create", () => {
    const dm = makeDm("dm31@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    expect(campaign.tone_tags).toEqual([]);

    const toned = createCampaign({
      dmId: dm.id,
      title: "T2",
      description: "",
      system: "S",
      capacity: 4,
      toneTags: ["horror", "heavy-combat"],
    });
    expect(toned.tone_tags).toEqual(["horror", "heavy-combat"]);
  });

  it("rejects a tone tag that isn't in CAMPAIGN_TONE_TAGS, on create and update", () => {
    const dm = makeDm("dm32@example.com");
    expect(() =>
      createCampaign({
        dmId: dm.id,
        title: "T",
        description: "",
        system: "S",
        capacity: 4,
        toneTags: ["not-a-real-tag"],
      })
    ).toThrow(CampaignError);

    const campaign = createCampaign({
      dmId: dm.id,
      title: "T2",
      description: "",
      system: "S",
      capacity: 4,
    });
    expect(() =>
      updateCampaign(campaign.id, dm.id, { toneTags: ["not-a-real-tag"] })
    ).toThrow(CampaignError);
  });

  it("rejects more than the max allowed tone tags", () => {
    const dm = makeDm("dm33@example.com");
    const tooMany = [...CAMPAIGN_TONE_TAGS].slice(0, 6);
    expect(() =>
      createCampaign({
        dmId: dm.id,
        title: "T",
        description: "",
        system: "S",
        capacity: 4,
        toneTags: tooMany,
      })
    ).toThrow(CampaignError);
  });

  it("lets the DM set, change, and clear tone_tags via update", () => {
    const dm = makeDm("dm34@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });

    const set = updateCampaign(campaign.id, dm.id, { toneTags: ["comedic", "exploration"] });
    expect(set.tone_tags).toEqual(["comedic", "exploration"]);

    const changed = updateCampaign(campaign.id, dm.id, { toneTags: ["horror"] });
    expect(changed.tone_tags).toEqual(["horror"]);

    const cleared = updateCampaign(campaign.id, dm.id, { toneTags: [] });
    expect(cleared.tone_tags).toEqual([]);
  });

  it("leaves tone_tags untouched when omitted from an update", () => {
    const dm = makeDm("dm35@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
      toneTags: ["mystery-investigation"],
    });
    const updated = updateCampaign(campaign.id, dm.id, { title: "New title" });
    expect(updated.tone_tags).toEqual(["mystery-investigation"]);
  });

  it("persists tone_tags correctly across a fresh read (round-trips through JSON storage)", () => {
    const dm = makeDm("dm36@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
      toneTags: ["horror", "one-shot-friendly"],
    });
    const fetched = getCampaign(campaign.id);
    expect(fetched?.tone_tags).toEqual(["horror", "one-shot-friendly"]);
  });

  it("filters listed campaigns by an any-of match on tone_tags", () => {
    const dm = makeDm("dm37@example.com");
    const sys = "Unique Tone System A";
    createCampaign({
      dmId: dm.id,
      title: "Horror Game",
      description: "",
      system: sys,
      capacity: 4,
      toneTags: ["horror"],
    });
    createCampaign({
      dmId: dm.id,
      title: "Comedy Game",
      description: "",
      system: sys,
      capacity: 4,
      toneTags: ["comedic"],
    });
    createCampaign({
      dmId: dm.id,
      title: "Horror-Comedy Game",
      description: "",
      system: sys,
      capacity: 4,
      toneTags: ["horror", "comedic"],
    });
    createCampaign({
      dmId: dm.id,
      title: "Political Game",
      description: "",
      system: sys,
      capacity: 4,
      toneTags: ["political-intrigue"],
    });

    const all = listCampaigns({ system: sys });
    expect(all.total).toBe(4);

    // Any-of, not all-of: selecting both "horror" and "comedic" matches
    // every campaign carrying at least one of them, including the one
    // that carries neither alone but both together, but not the
    // political-intrigue-only one.
    const horrorOrComedic = listCampaigns({ system: sys, toneTags: ["horror", "comedic"] });
    expect(horrorOrComedic.total).toBe(3);
    expect(horrorOrComedic.items.map((c) => c.title).sort()).toEqual(
      ["Comedy Game", "Horror Game", "Horror-Comedy Game"].sort()
    );

    const politicalOnly = listCampaigns({ system: sys, toneTags: ["political-intrigue"] });
    expect(politicalOnly.total).toBe(1);
    expect(politicalOnly.items[0].title).toBe("Political Game");
  });

  it("ignores an unrecognized tone tag in the browse filter rather than erroring", () => {
    const dm = makeDm("dm38@example.com");
    const sys = "Unique Tone System B";
    createCampaign({
      dmId: dm.id,
      title: "Any Game",
      description: "",
      system: sys,
      capacity: 4,
    });

    // An unrecognized tag alone means "no real filter applied" -- the
    // browse page shouldn't 500 or silently return zero results just
    // because a stale/tampered query string had a bogus tag in it.
    const result = listCampaigns({ system: sys, toneTags: ["not-a-real-tag"] });
    expect(result.total).toBe(1);
  });
});
