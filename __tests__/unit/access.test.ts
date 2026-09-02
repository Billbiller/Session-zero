import { describe, it, expect } from "vitest";
import { findOrCreateUser } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import {
  requestJoin,
  approveRequest,
  declineRequest,
  leaveCampaign,
} from "@/lib/memberships";
import { hasPrivateAccess, activePartyUserIds } from "@/lib/access";

function setup(emailPrefix: string) {
  const dm = findOrCreateUser("DM", `${emailPrefix}-dm@example.com`);
  const campaign = createCampaign({
    dmId: dm.id,
    title: "T",
    description: "",
    system: "S",
    capacity: 4,
  });
  return { dm, campaign };
}

describe("hasPrivateAccess", () => {
  it("grants the DM access", () => {
    const { dm, campaign } = setup("ha1");
    expect(hasPrivateAccess(dm.id, campaign.id)).toBe(true);
  });

  it("grants an approved member access", () => {
    const { dm, campaign } = setup("ha2");
    const player = findOrCreateUser("Player", "ha2-p@example.com");
    const m = requestJoin(campaign.id, player.id);
    approveRequest(m.id, dm.id);
    expect(hasPrivateAccess(player.id, campaign.id)).toBe(true);
  });

  it("denies a pending requester", () => {
    const { campaign } = setup("ha3");
    const player = findOrCreateUser("Player", "ha3-p@example.com");
    requestJoin(campaign.id, player.id);
    expect(hasPrivateAccess(player.id, campaign.id)).toBe(false);
  });

  it("denies a declined requester", () => {
    const { dm, campaign } = setup("ha4");
    const player = findOrCreateUser("Player", "ha4-p@example.com");
    const m = requestJoin(campaign.id, player.id);
    declineRequest(m.id, dm.id);
    expect(hasPrivateAccess(player.id, campaign.id)).toBe(false);
  });

  it("revokes access immediately once a member leaves", () => {
    const { dm, campaign } = setup("ha5");
    const player = findOrCreateUser("Player", "ha5-p@example.com");
    const m = requestJoin(campaign.id, player.id);
    approveRequest(m.id, dm.id);
    expect(hasPrivateAccess(player.id, campaign.id)).toBe(true);
    leaveCampaign(campaign.id, player.id);
    expect(hasPrivateAccess(player.id, campaign.id)).toBe(false);
  });

  it("denies a complete stranger", () => {
    const { campaign } = setup("ha6");
    const stranger = findOrCreateUser("Stranger", "ha6-s@example.com");
    expect(hasPrivateAccess(stranger.id, campaign.id)).toBe(false);
  });

  it("denies a signed-out visitor (null user id)", () => {
    const { campaign } = setup("ha7");
    expect(hasPrivateAccess(null, campaign.id)).toBe(false);
  });
});

describe("activePartyUserIds", () => {
  it("includes the DM and every approved member, excluding pending/declined/left", () => {
    const { dm, campaign } = setup("ap1");
    const approved = findOrCreateUser("Approved", "ap1-a@example.com");
    const pending = findOrCreateUser("Pending", "ap1-pe@example.com");
    const left = findOrCreateUser("Left", "ap1-l@example.com");

    const m1 = requestJoin(campaign.id, approved.id);
    approveRequest(m1.id, dm.id);
    requestJoin(campaign.id, pending.id);
    const m3 = requestJoin(campaign.id, left.id);
    approveRequest(m3.id, dm.id);
    leaveCampaign(campaign.id, left.id);

    const ids = activePartyUserIds(campaign.id);
    expect(ids).toContain(dm.id);
    expect(ids).toContain(approved.id);
    expect(ids).not.toContain(pending.id);
    expect(ids).not.toContain(left.id);
  });
});
