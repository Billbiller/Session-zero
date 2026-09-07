import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest } from "@/lib/memberships";
import { listNotifications } from "@/lib/notifications";
import {
  createSubRequest,
  listSubRequestsForCampaign,
  listOpenSubRequests,
  volunteerForSubRequest,
  withdrawVolunteer,
  listVolunteers,
  setSubRequestStatus,
  SubRequestError,
} from "@/lib/subRequests";

function setUpCampaignWithPlayer(dmEmail: string, playerEmail: string) {
  const dm = signUp("DM", dmEmail, "testpassword123");
  const player = signUp("Player", playerEmail, "testpassword123");
  const campaign = createCampaign({
    dmId: dm.id,
    title: "T",
    description: "",
    system: "S",
    capacity: 4,
  });
  const membership = requestJoin(campaign.id, player.id);
  approveRequest(membership.id, dm.id);
  return { dm, player, campaign };
}

describe("sub requests (backlog #20 phase 1)", () => {
  it("lets the DM or an approved member post a sub request, defaulting to open", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "sub-dm1@example.com",
      "sub-player1@example.com"
    );
    const fromDm = createSubRequest(campaign.id, dm.id, "Can't run next week.");
    const fromPlayer = createSubRequest(campaign.id, player.id, "Out of town.");
    expect(fromDm.status).toBe("open");
    expect(fromPlayer.status).toBe("open");
    expect(fromDm.note).toBe("Can't run next week.");
  });

  it("rejects a sub request from someone with no relationship to the campaign", () => {
    const dm = signUp("DM", "sub-dm2@example.com", "testpassword123");
    const stranger = signUp("Stranger", "sub-stranger2@example.com", "testpassword123");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    expect(() => createSubRequest(campaign.id, stranger.id, "note")).toThrow(SubRequestError);
  });

  it("rejects an over-length note", () => {
    const { dm, campaign } = setUpCampaignWithPlayer(
      "sub-dm3@example.com",
      "sub-player3@example.com"
    );
    expect(() => createSubRequest(campaign.id, dm.id, "x".repeat(501))).toThrow(SubRequestError);
  });

  it("lists open requests app-wide and hides filled/cancelled ones from the pool", () => {
    const { dm, campaign } = setUpCampaignWithPlayer(
      "sub-dm4@example.com",
      "sub-player4@example.com"
    );
    const request = createSubRequest(campaign.id, dm.id, "note");
    expect(listOpenSubRequests(null).map((r) => r.id)).toContain(request.id);
    setSubRequestStatus(request.id, dm.id, "filled");
    expect(listOpenSubRequests(null).map((r) => r.id)).not.toContain(request.id);
    // But the campaign's own list still shows it, filled and all.
    expect(listSubRequestsForCampaign(campaign.id, null).map((r) => r.id)).toContain(request.id);
  });

  it("enriches listings with campaign/requester display context and volunteer count", () => {
    const { dm, campaign } = setUpCampaignWithPlayer(
      "sub-dm5@example.com",
      "sub-player5@example.com"
    );
    const request = createSubRequest(campaign.id, dm.id, "note");
    const [summary] = listOpenSubRequests(null);
    expect(summary.campaignTitle).toBe(campaign.title);
    expect(summary.campaignSystem).toBe(campaign.system);
    expect(summary.requesterName).toBe("DM");
    expect(summary.volunteerCount).toBe(0);
    expect(summary.viewerHasVolunteered).toBe(false);
    expect(summary.id).toBe(request.id);
  });

  it("lets a stranger volunteer, and reflects that in viewerHasVolunteered for that viewer only", () => {
    const { dm, campaign } = setUpCampaignWithPlayer(
      "sub-dm6@example.com",
      "sub-player6@example.com"
    );
    const request = createSubRequest(campaign.id, dm.id, "note");
    const volunteer = signUp("Volunteer", "sub-volunteer6@example.com", "testpassword123");
    volunteerForSubRequest(request.id, volunteer.id, "I can help!");

    const asVolunteer = listOpenSubRequests(volunteer.id)[0];
    expect(asVolunteer.viewerHasVolunteered).toBe(true);
    expect(asVolunteer.volunteerCount).toBe(1);

    const asStranger = listOpenSubRequests(null)[0];
    expect(asStranger.viewerHasVolunteered).toBe(false);
    expect(asStranger.volunteerCount).toBe(1);
  });

  it("rejects the requester volunteering for their own request", () => {
    const { dm, campaign } = setUpCampaignWithPlayer(
      "sub-dm7@example.com",
      "sub-player7@example.com"
    );
    const request = createSubRequest(campaign.id, dm.id, "note");
    expect(() => volunteerForSubRequest(request.id, dm.id, "")).toThrow(SubRequestError);
  });

  it("rejects volunteering for a request that isn't open", () => {
    const { dm, campaign } = setUpCampaignWithPlayer(
      "sub-dm8@example.com",
      "sub-player8@example.com"
    );
    const request = createSubRequest(campaign.id, dm.id, "note");
    setSubRequestStatus(request.id, dm.id, "cancelled");
    const volunteer = signUp("Volunteer", "sub-volunteer8@example.com", "testpassword123");
    expect(() => volunteerForSubRequest(request.id, volunteer.id, "")).toThrow(SubRequestError);
  });

  it("updates an existing volunteer's message instead of duplicating on a second volunteer call", () => {
    const { dm, campaign } = setUpCampaignWithPlayer(
      "sub-dm9@example.com",
      "sub-player9@example.com"
    );
    const request = createSubRequest(campaign.id, dm.id, "note");
    const volunteer = signUp("Volunteer", "sub-volunteer9@example.com", "testpassword123");
    volunteerForSubRequest(request.id, volunteer.id, "first message");
    volunteerForSubRequest(request.id, volunteer.id, "second message");
    const volunteers = listVolunteers(request.id, dm.id);
    expect(volunteers).toHaveLength(1);
    expect(volunteers[0].message).toBe("second message");
  });

  it("lets a volunteer withdraw", () => {
    const { dm, campaign } = setUpCampaignWithPlayer(
      "sub-dm10@example.com",
      "sub-player10@example.com"
    );
    const request = createSubRequest(campaign.id, dm.id, "note");
    const volunteer = signUp("Volunteer", "sub-volunteer10@example.com", "testpassword123");
    volunteerForSubRequest(request.id, volunteer.id, "");
    withdrawVolunteer(request.id, volunteer.id);
    expect(listOpenSubRequests(volunteer.id)[0].viewerHasVolunteered).toBe(false);
    expect(listOpenSubRequests(volunteer.id)[0].volunteerCount).toBe(0);
  });

  it("restricts the volunteer list to the requester or DM", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "sub-dm11@example.com",
      "sub-player11@example.com"
    );
    const request = createSubRequest(campaign.id, player.id, "note");
    const volunteer = signUp("Volunteer", "sub-volunteer11@example.com", "testpassword123");
    volunteerForSubRequest(request.id, volunteer.id, "hi");

    expect(listVolunteers(request.id, player.id)).toHaveLength(1);
    expect(listVolunteers(request.id, dm.id)).toHaveLength(1);

    const stranger = signUp("Stranger", "sub-stranger11@example.com", "testpassword123");
    expect(() => listVolunteers(request.id, stranger.id)).toThrow(SubRequestError);
  });

  it("notifies the requester and DM (once each) on a fresh volunteer, but not on a message update", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "sub-dm12@example.com",
      "sub-player12@example.com"
    );
    const request = createSubRequest(campaign.id, player.id, "note");
    const volunteer = signUp("Volunteer", "sub-volunteer12@example.com", "testpassword123");
    volunteerForSubRequest(request.id, volunteer.id, "first");
    volunteerForSubRequest(request.id, volunteer.id, "updated message");

    const playerNotifs = listNotifications(player.id).items.filter(
      (n) => n.type === "sub_volunteer"
    );
    const dmNotifs = listNotifications(dm.id).items.filter((n) => n.type === "sub_volunteer");
    expect(playerNotifs).toHaveLength(1);
    expect(dmNotifs).toHaveLength(1);
  });

  it("lets the requester or DM mark a request filled or cancelled, but only from open", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "sub-dm13@example.com",
      "sub-player13@example.com"
    );
    const request = createSubRequest(campaign.id, player.id, "note");
    const updated = setSubRequestStatus(request.id, dm.id, "filled");
    expect(updated.status).toBe("filled");
    expect(() => setSubRequestStatus(request.id, dm.id, "cancelled")).toThrow(SubRequestError);
  });

  it("rejects a status change from someone who isn't the requester or DM", () => {
    const { player, campaign } = setUpCampaignWithPlayer(
      "sub-dm14@example.com",
      "sub-player14@example.com"
    );
    const request = createSubRequest(campaign.id, player.id, "note");
    const stranger = signUp("Stranger", "sub-stranger14@example.com", "testpassword123");
    expect(() => setSubRequestStatus(request.id, stranger.id, "filled")).toThrow(SubRequestError);
  });
});
