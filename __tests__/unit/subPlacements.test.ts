import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest } from "@/lib/memberships";
import { createCharacter, getCharacter } from "@/lib/characters";
import { createSubRequest, volunteerForSubRequest, getSubRequest } from "@/lib/subRequests";
import { listNotifications } from "@/lib/notifications";
import {
  createPlacement,
  ownerReview,
  dmReview,
  cancelPlacement,
  endSub,
  listPlacementsForRequest,
  getPlacement,
  SubPlacementError,
} from "@/lib/subPlacements";

function setUpTable(dmEmail: string, playerEmail: string, volunteerEmail: string) {
  const dm = signUp("DM", dmEmail, "testpassword123");
  const player = signUp("Player", playerEmail, "testpassword123");
  const volunteer = signUp("Volunteer", volunteerEmail, "testpassword123");
  const campaign = createCampaign({
    dmId: dm.id,
    title: "T",
    description: "",
    system: "S",
    capacity: 4,
  });
  approveRequest(requestJoin(campaign.id, player.id).id, dm.id);
  const character = createCharacter(player.id, { name: "Grog", campaignId: campaign.id });
  const request = createSubRequest(campaign.id, player.id, "note", character.id);
  volunteerForSubRequest(request.id, volunteer.id, "I can help!");
  return { dm, player, volunteer, campaign, character, request };
}

describe("sub placements (backlog #20 phase 2)", () => {
  it("lets the requester select a volunteer, creating a pending placement", () => {
    const { player, volunteer, request } = setUpTable(
      "place-dm1@example.com",
      "place-player1@example.com",
      "place-vol1@example.com"
    );
    const placement = createPlacement(request.id, player.id, volunteer.id);
    expect(placement.status).toBe("pending");
    expect(placement.owner_approved).toBe(0);
    expect(placement.dm_approved).toBe(0);
    expect(placement.volunteer_id).toBe(volunteer.id);
  });

  it("lets the DM select a volunteer too", () => {
    const { dm, volunteer, request } = setUpTable(
      "place-dm2@example.com",
      "place-player2@example.com",
      "place-vol2@example.com"
    );
    const placement = createPlacement(request.id, dm.id, volunteer.id);
    expect(placement.status).toBe("pending");
  });

  it("rejects selecting a volunteer from someone who isn't the requester or DM", () => {
    const { volunteer, request } = setUpTable(
      "place-dm3@example.com",
      "place-player3@example.com",
      "place-vol3@example.com"
    );
    const stranger = signUp("Stranger", "place-stranger3@example.com", "testpassword123");
    expect(() => createPlacement(request.id, stranger.id, volunteer.id)).toThrow(
      SubPlacementError
    );
  });

  it("rejects selecting someone who hasn't actually volunteered", () => {
    const { player, request } = setUpTable(
      "place-dm4@example.com",
      "place-player4@example.com",
      "place-vol4@example.com"
    );
    const notAVolunteer = signUp("NotAVolunteer", "place-nv4@example.com", "testpassword123");
    expect(() => createPlacement(request.id, player.id, notAVolunteer.id)).toThrow(
      SubPlacementError
    );
  });

  it("rejects creating a placement for a characterless request", () => {
    const dm = signUp("DM", "place-dm5@example.com", "testpassword123");
    const player = signUp("Player", "place-player5@example.com", "testpassword123");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    approveRequest(requestJoin(campaign.id, player.id).id, dm.id);
    const request = createSubRequest(campaign.id, player.id, "note"); // no characterId
    const volunteer = signUp("Volunteer", "place-vol5@example.com", "testpassword123");
    volunteerForSubRequest(request.id, volunteer.id, "");
    expect(() => createPlacement(request.id, player.id, volunteer.id)).toThrow(
      SubPlacementError
    );
  });

  it("rejects a second placement while one is already pending", () => {
    const { player, volunteer, request } = setUpTable(
      "place-dm6@example.com",
      "place-player6@example.com",
      "place-vol6@example.com"
    );
    createPlacement(request.id, player.id, volunteer.id);
    const secondVolunteer = signUp("Second", "place-vol6b@example.com", "testpassword123");
    volunteerForSubRequest(request.id, secondVolunteer.id, "");
    expect(() => createPlacement(request.id, player.id, secondVolunteer.id)).toThrow(
      SubPlacementError
    );
  });

  it("confirms the placement, sets temporary custody, and marks the request filled once both owner and DM approve", () => {
    const { dm, player, volunteer, character, request } = setUpTable(
      "place-dm7@example.com",
      "place-player7@example.com",
      "place-vol7@example.com"
    );
    const placement = createPlacement(request.id, player.id, volunteer.id);

    const afterOwner = ownerReview(placement.id, player.id, {
      approve: true,
      guardrailsNote: "No permanent death.",
    });
    expect(afterOwner.status).toBe("pending");
    expect(afterOwner.owner_approved).toBe(1);
    expect(getCharacter(character.id)?.temp_pilot_user_id).toBeNull();

    const afterDm = dmReview(placement.id, dm.id, true);
    expect(afterDm.status).toBe("confirmed");
    expect(afterDm.dm_approved).toBe(1);
    expect(afterDm.guardrails_note).toBe("No permanent death.");

    expect(getCharacter(character.id)?.temp_pilot_user_id).toBe(volunteer.id);
    expect(getSubRequest(request.id)?.status).toBe("filled");
  });

  it("confirms regardless of approval order (DM first, then owner)", () => {
    const { dm, player, volunteer, character, request } = setUpTable(
      "place-dm8@example.com",
      "place-player8@example.com",
      "place-vol8@example.com"
    );
    const placement = createPlacement(request.id, player.id, volunteer.id);
    dmReview(placement.id, dm.id, true);
    expect(getCharacter(character.id)?.temp_pilot_user_id).toBeNull();
    ownerReview(placement.id, player.id, { approve: true });
    expect(getCharacter(character.id)?.temp_pilot_user_id).toBe(volunteer.id);
  });

  it("ends the placement immediately when the owner declines, without needing the DM", () => {
    const { player, volunteer, request } = setUpTable(
      "place-dm9@example.com",
      "place-player9@example.com",
      "place-vol9@example.com"
    );
    const placement = createPlacement(request.id, player.id, volunteer.id);
    const declined = ownerReview(placement.id, player.id, { approve: false });
    expect(declined.status).toBe("declined");
    expect(getSubRequest(request.id)?.status).toBe("open");
  });

  it("ends the placement immediately when the DM declines", () => {
    const { dm, player, volunteer, request } = setUpTable(
      "place-dm10@example.com",
      "place-player10@example.com",
      "place-vol10@example.com"
    );
    const placement = createPlacement(request.id, player.id, volunteer.id);
    ownerReview(placement.id, player.id, { approve: true });
    const declined = dmReview(placement.id, dm.id, false);
    expect(declined.status).toBe("declined");
    expect(getSubRequest(request.id)?.status).toBe("open");
  });

  it("rejects a review from someone who isn't the actual owner or DM", () => {
    const { player, volunteer, request } = setUpTable(
      "place-dm11@example.com",
      "place-player11@example.com",
      "place-vol11@example.com"
    );
    const placement = createPlacement(request.id, player.id, volunteer.id);
    const stranger = signUp("Stranger", "place-stranger11@example.com", "testpassword123");
    expect(() => ownerReview(placement.id, stranger.id, { approve: true })).toThrow(
      SubPlacementError
    );
    expect(() => dmReview(placement.id, stranger.id, true)).toThrow(SubPlacementError);
  });

  it("rejects reviewing a placement that's already resolved", () => {
    const { dm, player, volunteer, request } = setUpTable(
      "place-dm12@example.com",
      "place-player12@example.com",
      "place-vol12@example.com"
    );
    const placement = createPlacement(request.id, player.id, volunteer.id);
    ownerReview(placement.id, player.id, { approve: false });
    expect(() => dmReview(placement.id, dm.id, true)).toThrow(SubPlacementError);
  });

  it("lets the requester or DM cancel a pending placement, re-opening the request for a new one", () => {
    const { player, volunteer, request } = setUpTable(
      "place-dm13@example.com",
      "place-player13@example.com",
      "place-vol13@example.com"
    );
    const placement = createPlacement(request.id, player.id, volunteer.id);
    const cancelled = cancelPlacement(placement.id, player.id);
    expect(cancelled.status).toBe("cancelled");

    const secondVolunteer = signUp("Second", "place-vol13b@example.com", "testpassword123");
    volunteerForSubRequest(request.id, secondVolunteer.id, "");
    const secondPlacement = createPlacement(request.id, player.id, secondVolunteer.id);
    expect(secondPlacement.status).toBe("pending");
  });

  it("rejects a cancel from someone who isn't the requester or DM", () => {
    const { player, volunteer, request } = setUpTable(
      "place-dm14@example.com",
      "place-player14@example.com",
      "place-vol14@example.com"
    );
    const placement = createPlacement(request.id, player.id, volunteer.id);
    const stranger = signUp("Stranger", "place-stranger14@example.com", "testpassword123");
    expect(() => cancelPlacement(placement.id, stranger.id)).toThrow(SubPlacementError);
  });

  it("lets the character's owner or the campaign's DM end a sub, clearing temp_pilot_user_id", () => {
    const { dm, player, volunteer, character, request } = setUpTable(
      "place-dm15@example.com",
      "place-player15@example.com",
      "place-vol15@example.com"
    );
    const placement = createPlacement(request.id, player.id, volunteer.id);
    ownerReview(placement.id, player.id, { approve: true });
    dmReview(placement.id, dm.id, true);
    expect(getCharacter(character.id)?.temp_pilot_user_id).toBe(volunteer.id);

    endSub(character.id, player.id);
    expect(getCharacter(character.id)?.temp_pilot_user_id).toBeNull();
    // The historical placement record itself is untouched.
    expect(getPlacement(placement.id)?.status).toBe("confirmed");
  });

  it("rejects ending a sub from someone who isn't the owner or DM", () => {
    const { dm, player, volunteer, character, request } = setUpTable(
      "place-dm16@example.com",
      "place-player16@example.com",
      "place-vol16@example.com"
    );
    const placement = createPlacement(request.id, player.id, volunteer.id);
    ownerReview(placement.id, player.id, { approve: true });
    dmReview(placement.id, dm.id, true);
    const stranger = signUp("Stranger", "place-stranger16@example.com", "testpassword123");
    expect(() => endSub(character.id, stranger.id)).toThrow(SubPlacementError);
  });

  it("notifies the volunteer, owner, DM, and the rest of the active party when a placement resolves", () => {
    const { dm, player, volunteer, campaign, request } = setUpTable(
      "place-dm17@example.com",
      "place-player17@example.com",
      "place-vol17@example.com"
    );
    const thirdMember = signUp("Third", "place-third17@example.com", "testpassword123");
    approveRequest(requestJoin(campaign.id, thirdMember.id).id, dm.id);

    const placement = createPlacement(request.id, player.id, volunteer.id);
    ownerReview(placement.id, player.id, { approve: true });
    dmReview(placement.id, dm.id, true);

    for (const user of [dm, player, volunteer, thirdMember]) {
      const resolved = listNotifications(user.id).items.filter(
        (n) => n.type === "sub_placement_resolved"
      );
      expect(resolved.length).toBeGreaterThan(0);
    }
  });

  it("lists all placements for a request, including resolved ones", () => {
    const { player, volunteer, request } = setUpTable(
      "place-dm18@example.com",
      "place-player18@example.com",
      "place-vol18@example.com"
    );
    const placement = createPlacement(request.id, player.id, volunteer.id);
    ownerReview(placement.id, player.id, { approve: false });
    const listed = listPlacementsForRequest(request.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].status).toBe("declined");
    expect(listed[0].characterName).toBe("Grog");
  });
});
