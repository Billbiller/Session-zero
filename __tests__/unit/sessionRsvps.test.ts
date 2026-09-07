import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest, leaveCampaign } from "@/lib/memberships";
import { updateSchedule } from "@/lib/schedule";
import { setRsvp, listRsvps, getViewerRsvp, clearRsvpsForCampaign, RsvpError } from "@/lib/sessionRsvps";

function setupParty(emailPrefix: string, scheduled = true) {
  const dm = signUp("DM", `${emailPrefix}-dm@example.com`, "testpassword123");
  const campaign = createCampaign({
    dmId: dm.id,
    title: "The Sunken Keep",
    description: "",
    system: "S",
    capacity: 4,
  });
  const p1 = signUp("P1", `${emailPrefix}-p1@example.com`, "testpassword123");
  const p2 = signUp("P2", `${emailPrefix}-p2@example.com`, "testpassword123");
  for (const p of [p1, p2]) {
    const m = requestJoin(campaign.id, p.id);
    approveRequest(m.id, dm.id);
  }
  if (scheduled) {
    updateSchedule(campaign.id, dm.id, new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString());
  }
  return { dm, campaign, p1, p2 };
}

describe("session RSVP (backlog #35)", () => {
  it("lets an active member confirm and a DM decline", () => {
    const { dm, campaign, p1 } = setupParty("rsvp1");
    expect(setRsvp(campaign.id, p1.id, "confirmed")).toBe("confirmed");
    expect(setRsvp(campaign.id, dm.id, "declined")).toBe("declined");
    expect(getViewerRsvp(campaign.id, p1.id)).toBe("confirmed");
    expect(getViewerRsvp(campaign.id, dm.id)).toBe("declined");
  });

  it("lets a member change their response, and clear it back to no response", () => {
    const { campaign, p1 } = setupParty("rsvp2");
    setRsvp(campaign.id, p1.id, "confirmed");
    setRsvp(campaign.id, p1.id, "declined");
    expect(getViewerRsvp(campaign.id, p1.id)).toBe("declined");
    setRsvp(campaign.id, p1.id, null);
    expect(getViewerRsvp(campaign.id, p1.id)).toBeNull();
  });

  it("defaults to no response (null) for someone who hasn't RSVPed yet", () => {
    const { campaign, p2 } = setupParty("rsvp3");
    expect(getViewerRsvp(campaign.id, p2.id)).toBeNull();
  });

  it("rejects a stranger with no relationship to the campaign", () => {
    const { campaign } = setupParty("rsvp4");
    const stranger = signUp("Stranger", "rsvp4-s@example.com", "testpassword123");
    expect(() => setRsvp(campaign.id, stranger.id, "confirmed")).toThrow(RsvpError);
  });

  it("rejects a pending (not-yet-approved) requester", () => {
    const dm = signUp("DM", "rsvp5-dm@example.com", "testpassword123");
    const campaign = createCampaign({ dmId: dm.id, title: "T", description: "", system: "S", capacity: 4 });
    updateSchedule(campaign.id, dm.id, new Date(Date.now() + 100000).toISOString());
    const pending = signUp("Pending", "rsvp5-p@example.com", "testpassword123");
    requestJoin(campaign.id, pending.id);
    expect(() => setRsvp(campaign.id, pending.id, "confirmed")).toThrow(RsvpError);
  });

  it("rejects a member who has since left", () => {
    const { campaign, p1 } = setupParty("rsvp6");
    leaveCampaign(campaign.id, p1.id);
    expect(() => setRsvp(campaign.id, p1.id, "confirmed")).toThrow(RsvpError);
  });

  it("rejects RSVPing when there's no scheduled session yet", () => {
    const { campaign, p1 } = setupParty("rsvp7", /* scheduled */ false);
    expect(() => setRsvp(campaign.id, p1.id, "confirmed")).toThrow(RsvpError);
  });

  it("lists every active party member with their response, including a null for no answer yet", () => {
    const { dm, campaign, p1, p2 } = setupParty("rsvp8");
    setRsvp(campaign.id, p1.id, "confirmed");
    setRsvp(campaign.id, dm.id, "declined");

    const rsvps = listRsvps(campaign.id);
    const byUser = new Map(rsvps.map((r) => [r.userId, r]));
    expect(byUser.get(p1.id)?.response).toBe("confirmed");
    expect(byUser.get(dm.id)?.response).toBe("declined");
    expect(byUser.get(dm.id)?.isDm).toBe(true);
    expect(byUser.get(p2.id)?.response).toBeNull();
    expect(byUser.get(p2.id)?.isDm).toBe(false);
  });

  it("clearRsvpsForCampaign wipes every response for that campaign only", () => {
    const { campaign: campaignA, p1: p1A } = setupParty("rsvp9a");
    const { campaign: campaignB, p1: p1B } = setupParty("rsvp9b");
    setRsvp(campaignA.id, p1A.id, "confirmed");
    setRsvp(campaignB.id, p1B.id, "confirmed");

    clearRsvpsForCampaign(campaignA.id);
    expect(getViewerRsvp(campaignA.id, p1A.id)).toBeNull();
    expect(getViewerRsvp(campaignB.id, p1B.id)).toBe("confirmed");
  });

  it("rescheduling the session clears every existing RSVP", () => {
    const { dm, campaign, p1, p2 } = setupParty("rsvp10");
    setRsvp(campaign.id, p1.id, "confirmed");
    setRsvp(campaign.id, p2.id, "declined");

    updateSchedule(campaign.id, dm.id, new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString());

    expect(getViewerRsvp(campaign.id, p1.id)).toBeNull();
    expect(getViewerRsvp(campaign.id, p2.id)).toBeNull();
  });

  it("clearing the schedule back to unscheduled also clears RSVPs", () => {
    const { dm, campaign, p1 } = setupParty("rsvp11");
    setRsvp(campaign.id, p1.id, "confirmed");
    updateSchedule(campaign.id, dm.id, null);
    expect(getViewerRsvp(campaign.id, p1.id)).toBeNull();
  });

  it("re-saving the exact same scheduled date does not clear existing RSVPs", () => {
    const dm = signUp("DM", "rsvp12-dm@example.com", "testpassword123");
    const campaign = createCampaign({ dmId: dm.id, title: "T", description: "", system: "S", capacity: 4 });
    const p1 = signUp("P1", "rsvp12-p1@example.com", "testpassword123");
    const m = requestJoin(campaign.id, p1.id);
    approveRequest(m.id, dm.id);

    const iso = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    updateSchedule(campaign.id, dm.id, iso);
    setRsvp(campaign.id, p1.id, "confirmed");

    updateSchedule(campaign.id, dm.id, iso);
    expect(getViewerRsvp(campaign.id, p1.id)).toBe("confirmed");
  });
});
