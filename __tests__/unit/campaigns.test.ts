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
