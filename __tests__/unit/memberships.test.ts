import { describe, it, expect } from "vitest";
import { findOrCreateUser } from "@/lib/auth";
import { createCampaign, approvedHeadcount, getCampaign, setCancelled } from "@/lib/campaigns";
import {
  requestJoin,
  approveRequest,
  declineRequest,
  leaveCampaign,
  listRequests,
  MembershipError,
} from "@/lib/memberships";
import { listNotifications } from "@/lib/notifications";
import db from "@/lib/db";

function setupCampaign(capacity: number, emailPrefix: string) {
  const dm = findOrCreateUser("DM", `${emailPrefix}-dm@example.com`);
  const campaign = createCampaign({
    dmId: dm.id,
    title: "T",
    description: "",
    system: "S",
    capacity,
  });
  return { dm, campaign };
}

describe("memberships", () => {
  it("lets a player request to join, notifying the DM", () => {
    const { dm, campaign } = setupCampaign(4, "m1");
    const player = findOrCreateUser("Player", "m1-p@example.com");
    const membership = requestJoin(campaign.id, player.id);
    expect(membership.status).toBe("pending");
    const dmNotifications = listNotifications(dm.id).items;
    expect(dmNotifications.some((n) => n.type === "join_requested")).toBe(true);
  });

  it("blocks the DM from joining their own campaign", () => {
    const { dm, campaign } = setupCampaign(4, "m2");
    expect(() => requestJoin(campaign.id, dm.id)).toThrow(MembershipError);
  });

  it("blocks a second active request from the same player", () => {
    const { campaign } = setupCampaign(4, "m3");
    const player = findOrCreateUser("Player", "m3-p@example.com");
    requestJoin(campaign.id, player.id);
    expect(() => requestJoin(campaign.id, player.id)).toThrow(MembershipError);
  });

  it("blocks join requests on a cancelled campaign", () => {
    const { dm, campaign } = setupCampaign(4, "m4");
    setCancelled(campaign.id, dm.id, true);
    const player = findOrCreateUser("Player", "m4-p@example.com");
    expect(() => requestJoin(campaign.id, player.id)).toThrow(MembershipError);
  });

  it("approves a request, notifying the requester", () => {
    const { dm, campaign } = setupCampaign(4, "m5");
    const player = findOrCreateUser("Player", "m5-p@example.com");
    const membership = requestJoin(campaign.id, player.id);
    const approved = approveRequest(membership.id, dm.id);
    expect(approved.status).toBe("approved");
    expect(
      listNotifications(player.id).items.some((n) => n.type === "join_approved")
    ).toBe(true);
  });

  it("declines a request, notifying the requester", () => {
    const { dm, campaign } = setupCampaign(4, "m6");
    const player = findOrCreateUser("Player", "m6-p@example.com");
    const membership = requestJoin(campaign.id, player.id);
    const declined = declineRequest(membership.id, dm.id);
    expect(declined.status).toBe("declined");
    expect(
      listNotifications(player.id).items.some((n) => n.type === "join_declined")
    ).toBe(true);
  });

  it("rejects approve/decline from a non-DM", () => {
    const { campaign } = setupCampaign(4, "m7");
    const player = findOrCreateUser("Player", "m7-p@example.com");
    const stranger = findOrCreateUser("Stranger", "m7-s@example.com");
    const membership = requestJoin(campaign.id, player.id);
    expect(() => approveRequest(membership.id, stranger.id)).toThrow(MembershipError);
  });

  it("auto-fills (closes to new requests) once capacity is hit", () => {
    const { dm, campaign } = setupCampaign(1, "m8");
    const player = findOrCreateUser("Player", "m8-p@example.com");
    const other = findOrCreateUser("Other", "m8-o@example.com");
    const membership = requestJoin(campaign.id, player.id);
    approveRequest(membership.id, dm.id);
    expect(getCampaign(campaign.id)?.accepting_requests).toBe(0);
    expect(() => requestJoin(campaign.id, other.id)).toThrow(MembershipError);
  });

  it("auto-reopens when a leave drops below capacity, and leaving notifies the rest of the party not just the DM", () => {
    const { dm, campaign } = setupCampaign(3, "m9");
    const p1 = findOrCreateUser("P1", "m9-p1@example.com");
    const p2 = findOrCreateUser("P2", "m9-p2@example.com");
    const p3 = findOrCreateUser("P3", "m9-p3@example.com");

    for (const p of [p1, p2, p3]) {
      const m = requestJoin(campaign.id, p.id);
      approveRequest(m.id, dm.id);
    }
    expect(getCampaign(campaign.id)?.accepting_requests).toBe(0);

    leaveCampaign(campaign.id, p1.id);

    expect(approvedHeadcount(campaign.id)).toBe(2);
    expect(getCampaign(campaign.id)?.accepting_requests).toBe(1);

    // DM gets member_left_dm
    expect(
      listNotifications(dm.id).items.some((n) => n.type === "member_left_dm")
    ).toBe(true);
    // The other two active members get member_left_party (not the leaver)
    expect(
      listNotifications(p2.id).items.some((n) => n.type === "member_left_party")
    ).toBe(true);
    expect(
      listNotifications(p3.id).items.some((n) => n.type === "member_left_party")
    ).toBe(true);
    expect(
      listNotifications(p1.id).items.some((n) => n.type === "member_left_party")
    ).toBe(false);
  });

  it("lets a DM manually reopen a full campaign without anyone leaving", () => {
    const { dm, campaign } = setupCampaign(1, "m10");
    const player = findOrCreateUser("Player", "m10-p@example.com");
    const other = findOrCreateUser("Other", "m10-o@example.com");
    const membership = requestJoin(campaign.id, player.id);
    approveRequest(membership.id, dm.id);
    expect(getCampaign(campaign.id)?.accepting_requests).toBe(0);

    // Manual reopen itself is exercised in campaigns.test.ts; here we just confirm
    // a reopened campaign accepts more requests even though nobody left.
    db.prepare("UPDATE campaigns SET accepting_requests = 1 WHERE id = ?").run(campaign.id);
    const secondRequest = requestJoin(campaign.id, other.id);
    expect(secondRequest.status).toBe("pending");
  });

  it("rejects the DM leaving their own campaign", () => {
    const { dm, campaign } = setupCampaign(4, "m11");
    expect(() => leaveCampaign(campaign.id, dm.id)).toThrow(MembershipError);
  });

  it("lists requests filtered by status", () => {
    const { dm, campaign } = setupCampaign(4, "m12");
    const p1 = findOrCreateUser("P1", "m12-p1@example.com");
    const p2 = findOrCreateUser("P2", "m12-p2@example.com");
    const m1 = requestJoin(campaign.id, p1.id);
    requestJoin(campaign.id, p2.id);
    approveRequest(m1.id, dm.id);

    expect(listRequests(campaign.id, "pending")).toHaveLength(1);
    expect(listRequests(campaign.id, "approved")).toHaveLength(1);
    expect(listRequests(campaign.id)).toHaveLength(2);
  });
});
