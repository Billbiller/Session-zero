import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest } from "@/lib/memberships";
import {
  listInitiativeEntries,
  addInitiativeEntry,
  updateInitiativeEntry,
  removeInitiativeEntry,
  moveInitiativeEntry,
  clearInitiativeEntries,
  InitiativeTrackerError,
} from "@/lib/initiativeTracker";

function setup(emailPrefix: string) {
  const dm = signUp("DM", `${emailPrefix}-dm@example.com`, "testpassword123");
  const campaign = createCampaign({
    dmId: dm.id,
    title: "The Sunken Keep",
    description: "",
    system: "S",
    capacity: 4,
  });
  const player = signUp("Player", `${emailPrefix}-p@example.com`, "testpassword123");
  const m = requestJoin(campaign.id, player.id);
  approveRequest(m.id, dm.id);
  return { dm, campaign, player };
}

describe("initiative tracker (backlog #33)", () => {
  it("lets the DM add combatants, listed in the order they were added", () => {
    const { dm, campaign } = setup("it1");
    addInitiativeEntry(campaign.id, dm.id, { name: "  Goblin  ", initiative: 12, hp: " 7/7 ", notes: " sneaky " });
    addInitiativeEntry(campaign.id, dm.id, { name: "Aria", initiative: 18 });

    const entries = listInitiativeEntries(campaign.id);
    expect(entries.map((e) => e.name)).toEqual(["Goblin", "Aria"]);
    expect(entries[0].initiative).toBe(12);
    expect(entries[0].hp).toBe("7/7");
    expect(entries[0].notes).toBe("sneaky");
    expect(entries[1].hp).toBeNull();
    expect(entries[1].notes).toBe("");
    expect(entries.map((e) => e.order_index)).toEqual([0, 1]);
  });

  it("rejects adding from an approved player (not the DM)", () => {
    const { campaign, player } = setup("it2");
    expect(() =>
      addInitiativeEntry(campaign.id, player.id, { name: "Cheater", initiative: 20 })
    ).toThrow(InitiativeTrackerError);
  });

  it("rejects adding from a complete stranger", () => {
    const { campaign } = setup("it3");
    const stranger = signUp("Stranger", "it3-s@example.com", "testpassword123");
    expect(() =>
      addInitiativeEntry(campaign.id, stranger.id, { name: "Ghost", initiative: 5 })
    ).toThrow(InitiativeTrackerError);
  });

  it("rejects a blank name", () => {
    const { dm, campaign } = setup("it4");
    expect(() => addInitiativeEntry(campaign.id, dm.id, { name: "   ", initiative: 10 })).toThrow(
      InitiativeTrackerError
    );
  });

  it("rejects an over-length name, hp, or notes", () => {
    const { dm, campaign } = setup("it5");
    expect(() =>
      addInitiativeEntry(campaign.id, dm.id, { name: "x".repeat(101), initiative: 10 })
    ).toThrow(InitiativeTrackerError);
    expect(() =>
      addInitiativeEntry(campaign.id, dm.id, { name: "Ok", initiative: 10, hp: "x".repeat(51) })
    ).toThrow(InitiativeTrackerError);
    expect(() =>
      addInitiativeEntry(campaign.id, dm.id, { name: "Ok", initiative: 10, notes: "x".repeat(501) })
    ).toThrow(InitiativeTrackerError);
  });

  it("rejects a non-finite initiative value", () => {
    const { dm, campaign } = setup("it6");
    expect(() =>
      addInitiativeEntry(campaign.id, dm.id, { name: "Ok", initiative: Number.NaN })
    ).toThrow(InitiativeTrackerError);
    expect(() =>
      addInitiativeEntry(campaign.id, dm.id, { name: "Ok", initiative: Number.POSITIVE_INFINITY })
    ).toThrow(InitiativeTrackerError);
  });

  it("updates an entry, changing only the given fields", () => {
    const { dm, campaign } = setup("it7");
    const entry = addInitiativeEntry(campaign.id, dm.id, {
      name: "Goblin",
      initiative: 12,
      hp: "7/7",
      notes: "sneaky",
    });
    const updated = updateInitiativeEntry(entry.id, dm.id, { hp: "3/7" });
    expect(updated.hp).toBe("3/7");
    expect(updated.name).toBe("Goblin");
    expect(updated.initiative).toBe(12);
    expect(updated.notes).toBe("sneaky");
  });

  it("rejects an update from a non-DM and from an unknown entry id", () => {
    const { dm, campaign, player } = setup("it8");
    const entry = addInitiativeEntry(campaign.id, dm.id, { name: "Goblin", initiative: 12 });
    expect(() => updateInitiativeEntry(entry.id, player.id, { hp: "0/7" })).toThrow(
      InitiativeTrackerError
    );
    expect(() => updateInitiativeEntry("nonexistent", dm.id, { hp: "0/7" })).toThrow(
      InitiativeTrackerError
    );
  });

  it("removes an entry and re-tightens the remaining order_index values", () => {
    const { dm, campaign } = setup("it9");
    const a = addInitiativeEntry(campaign.id, dm.id, { name: "A", initiative: 1 });
    const b = addInitiativeEntry(campaign.id, dm.id, { name: "B", initiative: 2 });
    const c = addInitiativeEntry(campaign.id, dm.id, { name: "C", initiative: 3 });

    removeInitiativeEntry(b.id, dm.id);

    const remaining = listInitiativeEntries(campaign.id);
    expect(remaining.map((e) => e.id)).toEqual([a.id, c.id]);
    expect(remaining.map((e) => e.order_index)).toEqual([0, 1]);
  });

  it("rejects removing from a non-DM and removing an unknown entry", () => {
    const { dm, campaign, player } = setup("it10");
    const entry = addInitiativeEntry(campaign.id, dm.id, { name: "Goblin", initiative: 12 });
    expect(() => removeInitiativeEntry(entry.id, player.id)).toThrow(InitiativeTrackerError);
    expect(() => removeInitiativeEntry("nonexistent", dm.id)).toThrow(InitiativeTrackerError);
  });

  it("moves an entry up or down, swapping with its neighbor", () => {
    const { dm, campaign } = setup("it11");
    const a = addInitiativeEntry(campaign.id, dm.id, { name: "A", initiative: 1 });
    const b = addInitiativeEntry(campaign.id, dm.id, { name: "B", initiative: 2 });
    addInitiativeEntry(campaign.id, dm.id, { name: "C", initiative: 3 });

    let ordered = moveInitiativeEntry(b.id, dm.id, "up");
    expect(ordered.map((e) => e.name)).toEqual(["B", "A", "C"]);

    ordered = moveInitiativeEntry(a.id, dm.id, "down");
    expect(ordered.map((e) => e.name)).toEqual(["B", "C", "A"]);
  });

  it("no-ops moving the first entry up or the last entry down", () => {
    const { dm, campaign } = setup("it12");
    const a = addInitiativeEntry(campaign.id, dm.id, { name: "A", initiative: 1 });
    const b = addInitiativeEntry(campaign.id, dm.id, { name: "B", initiative: 2 });

    const upResult = moveInitiativeEntry(a.id, dm.id, "up");
    expect(upResult.map((e) => e.name)).toEqual(["A", "B"]);

    const downResult = moveInitiativeEntry(b.id, dm.id, "down");
    expect(downResult.map((e) => e.name)).toEqual(["A", "B"]);
  });

  it("rejects moving from a non-DM", () => {
    const { dm, campaign, player } = setup("it13");
    const entry = addInitiativeEntry(campaign.id, dm.id, { name: "A", initiative: 1 });
    expect(() => moveInitiativeEntry(entry.id, player.id, "up")).toThrow(InitiativeTrackerError);
  });

  it("clears every entry for a campaign, leaving other campaigns untouched", () => {
    const { dm, campaign } = setup("it14");
    const other = setup("it14b");
    addInitiativeEntry(campaign.id, dm.id, { name: "A", initiative: 1 });
    addInitiativeEntry(campaign.id, dm.id, { name: "B", initiative: 2 });
    addInitiativeEntry(other.campaign.id, other.dm.id, { name: "X", initiative: 5 });

    clearInitiativeEntries(campaign.id, dm.id);

    expect(listInitiativeEntries(campaign.id)).toEqual([]);
    expect(listInitiativeEntries(other.campaign.id)).toHaveLength(1);
  });

  it("rejects clearing from a non-DM", () => {
    const { campaign, player } = setup("it15");
    expect(() => clearInitiativeEntries(campaign.id, player.id)).toThrow(InitiativeTrackerError);
  });
});
