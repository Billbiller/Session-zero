import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest, leaveCampaign } from "@/lib/memberships";
import {
  rateCampaign,
  getCampaignRating,
  canRateCampaign,
  getCampaignRatingSummary,
  CampaignRatingError,
  CAMPAIGN_RATING_TAGS,
} from "@/lib/campaignRatings";

function setUp(dmEmail: string, playerEmail: string) {
  const dm = signUp("DM " + dmEmail, dmEmail, "testpassword123");
  const player = signUp("Player " + playerEmail, playerEmail, "testpassword123");
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

describe("campaign ratings (backlog #28)", () => {
  it("lets an approved member rate the campaign", () => {
    const { player, campaign } = setUp("cr-dm1@example.com", "cr-player1@example.com");
    const rating = rateCampaign(campaign.id, player.id, {
      stars: 5,
      tags: ["Well organized", "Would recommend"],
    });
    expect(rating.stars).toBe(5);
    expect(rating.tags).toEqual(["Well organized", "Would recommend"]);
    expect(rating.campaign_id).toBe(campaign.id);
    expect(rating.rater_id).toBe(player.id);
  });

  it("rejects the DM rating their own campaign", () => {
    const { dm, campaign } = setUp("cr-dm2@example.com", "cr-player2@example.com");
    expect(() => rateCampaign(campaign.id, dm.id, { stars: 5 })).toThrow(CampaignRatingError);
  });

  it("rejects a stranger who never joined the campaign", () => {
    const { campaign } = setUp("cr-dm3@example.com", "cr-player3@example.com");
    const stranger = signUp("Stranger", "cr-stranger3@example.com", "testpassword123");
    expect(() => rateCampaign(campaign.id, stranger.id, { stars: 3 })).toThrow(
      CampaignRatingError
    );
  });

  it("rejects a pending (not-yet-approved) requester", () => {
    const dm = signUp("DM", "cr-dm4@example.com", "testpassword123");
    const requester = signUp("Requester", "cr-requester4@example.com", "testpassword123");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    requestJoin(campaign.id, requester.id); // left pending, not approved
    expect(canRateCampaign(campaign.id, requester.id)).toBe(false);
    expect(() => rateCampaign(campaign.id, requester.id, { stars: 3 })).toThrow(
      CampaignRatingError
    );
  });

  it("still allows rating after the player has left the campaign", () => {
    const { player, campaign } = setUp("cr-dm5@example.com", "cr-player5@example.com");
    leaveCampaign(campaign.id, player.id);
    expect(canRateCampaign(campaign.id, player.id)).toBe(true);
    const rating = rateCampaign(campaign.id, player.id, { stars: 4 });
    expect(rating.stars).toBe(4);
  });

  it("rejects an out-of-range star value", () => {
    const { player, campaign } = setUp("cr-dm6@example.com", "cr-player6@example.com");
    expect(() => rateCampaign(campaign.id, player.id, { stars: 0 })).toThrow(CampaignRatingError);
    expect(() => rateCampaign(campaign.id, player.id, { stars: 6 })).toThrow(CampaignRatingError);
    expect(() => rateCampaign(campaign.id, player.id, { stars: 3.5 })).toThrow(
      CampaignRatingError
    );
  });

  it("rejects a tag that isn't in CAMPAIGN_RATING_TAGS", () => {
    const { player, campaign } = setUp("cr-dm7@example.com", "cr-player7@example.com");
    expect(() =>
      rateCampaign(campaign.id, player.id, { stars: 5, tags: ["Not a real tag"] })
    ).toThrow(CampaignRatingError);
  });

  it("rejects more than the max allowed tags", () => {
    const { player, campaign } = setUp("cr-dm8@example.com", "cr-player8@example.com");
    const tooMany = [...CAMPAIGN_RATING_TAGS, ...CAMPAIGN_RATING_TAGS].slice(0, 9);
    expect(() => rateCampaign(campaign.id, player.id, { stars: 5, tags: tooMany })).toThrow(
      CampaignRatingError
    );
  });

  it("upserts on a second rating from the same rater instead of creating a duplicate", () => {
    const { player, campaign } = setUp("cr-dm9@example.com", "cr-player9@example.com");
    const first = rateCampaign(campaign.id, player.id, { stars: 3 });
    const second = rateCampaign(campaign.id, player.id, {
      stars: 5,
      tags: ["Great communication"],
    });
    expect(second.id).toBe(first.id);
    expect(getCampaignRating(campaign.id, player.id)?.stars).toBe(5);
    expect(getCampaignRatingSummary(campaign.id).count).toBe(1);
  });

  it("reports a campaign with no ratings as unrated (null average), not zero", () => {
    const { campaign } = setUp("cr-dm10@example.com", "cr-player10@example.com");
    const summary = getCampaignRatingSummary(campaign.id);
    expect(summary.average).toBeNull();
    expect(summary.count).toBe(0);
    expect(summary.tagCounts).toEqual({});
  });

  it("averages multiple ratings and tallies tag counts", () => {
    const dm = signUp("DM", "cr-dm11@example.com", "testpassword123");
    const p1 = signUp("P1", "cr-p1-11@example.com", "testpassword123");
    const p2 = signUp("P2", "cr-p2-11@example.com", "testpassword123");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    approveRequest(requestJoin(campaign.id, p1.id).id, dm.id);
    approveRequest(requestJoin(campaign.id, p2.id).id, dm.id);

    rateCampaign(campaign.id, p1.id, { stars: 5, tags: ["Well organized"] });
    rateCampaign(campaign.id, p2.id, { stars: 3, tags: ["Well organized", "Would recommend"] });

    const summary = getCampaignRatingSummary(campaign.id);
    expect(summary.count).toBe(2);
    expect(summary.average).toBe(4);
    expect(summary.tagCounts["Well organized"]).toBe(2);
    expect(summary.tagCounts["Would recommend"]).toBe(1);
  });

  it("keeps ratings isolated per campaign", () => {
    const dm = signUp("DM", "cr-dm12@example.com", "testpassword123");
    const player = signUp("Player", "cr-player12@example.com", "testpassword123");
    const campaignA = createCampaign({
      dmId: dm.id,
      title: "A",
      description: "",
      system: "S",
      capacity: 4,
    });
    const campaignB = createCampaign({
      dmId: dm.id,
      title: "B",
      description: "",
      system: "S",
      capacity: 4,
    });
    approveRequest(requestJoin(campaignA.id, player.id).id, dm.id);
    approveRequest(requestJoin(campaignB.id, player.id).id, dm.id);

    rateCampaign(campaignA.id, player.id, { stars: 5 });
    expect(getCampaignRatingSummary(campaignA.id).count).toBe(1);
    expect(getCampaignRatingSummary(campaignB.id).count).toBe(0);
    expect(getCampaignRating(campaignB.id, player.id)).toBeNull();
  });
});
