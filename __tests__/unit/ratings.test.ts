import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest, leaveCampaign } from "@/lib/memberships";
import { listNotifications } from "@/lib/notifications";
import {
  rateCampaignParticipant,
  getRating,
  ratingTargetsFor,
  getUserRatingSummary,
  RatingError,
  DM_RATING_TAGS,
  PLAYER_RATING_TAGS,
  MAX_COMMENT_LENGTH,
} from "@/lib/ratings";

function makeDm(email: string) {
  return signUp("DM " + email, email, "testpassword123");
}

function setUpCampaignWithPlayer(dmEmail: string, playerEmail: string) {
  const dm = makeDm(dmEmail);
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

describe("ratings", () => {
  it("lets a player rate the DM", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "rate-dm1@example.com",
      "rate-player1@example.com"
    );
    const rating = rateCampaignParticipant(campaign.id, player.id, dm.id, {
      stars: 5,
      tags: ["Great narrator", "On time"],
    });
    expect(rating.ratee_role).toBe("dm");
    expect(rating.stars).toBe(5);
    expect(rating.tags).toEqual(["Great narrator", "On time"]);
  });

  it("lets the DM rate a player", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "rate-dm2@example.com",
      "rate-player2@example.com"
    );
    const rating = rateCampaignParticipant(campaign.id, dm.id, player.id, {
      stars: 4,
      tags: ["Team player"],
    });
    expect(rating.ratee_role).toBe("player");
    expect(rating.stars).toBe(4);
  });

  it("rejects a player rating another player", () => {
    const dm = makeDm("rate-dm3@example.com");
    const p1 = signUp("P1", "rate-p1-3@example.com", "testpassword123");
    const p2 = signUp("P2", "rate-p2-3@example.com", "testpassword123");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    approveRequest(requestJoin(campaign.id, p1.id).id, dm.id);
    approveRequest(requestJoin(campaign.id, p2.id).id, dm.id);
    expect(() =>
      rateCampaignParticipant(campaign.id, p1.id, p2.id, { stars: 3 })
    ).toThrow(RatingError);
  });

  it("rejects self-rating and rating a stranger", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "rate-dm4@example.com",
      "rate-player4@example.com"
    );
    const stranger = signUp("Stranger", "rate-stranger4@example.com", "testpassword123");
    expect(() => rateCampaignParticipant(campaign.id, dm.id, dm.id, { stars: 5 })).toThrow(
      RatingError
    );
    expect(() =>
      rateCampaignParticipant(campaign.id, dm.id, stranger.id, { stars: 5 })
    ).toThrow(RatingError);
    expect(() =>
      rateCampaignParticipant(campaign.id, stranger.id, player.id, { stars: 5 })
    ).toThrow(RatingError);
  });

  it("rejects an out-of-range star value", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "rate-dm5@example.com",
      "rate-player5@example.com"
    );
    expect(() => rateCampaignParticipant(campaign.id, player.id, dm.id, { stars: 0 })).toThrow(
      RatingError
    );
    expect(() => rateCampaignParticipant(campaign.id, player.id, dm.id, { stars: 6 })).toThrow(
      RatingError
    );
    expect(() =>
      rateCampaignParticipant(campaign.id, player.id, dm.id, { stars: 3.5 })
    ).toThrow(RatingError);
  });

  it("rejects a tag that doesn't belong to the ratee's role", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "rate-dm6@example.com",
      "rate-player6@example.com"
    );
    // Rating the DM (role "dm") with a player-only tag should fail.
    const playerOnlyTag = PLAYER_RATING_TAGS.find((t) => !(DM_RATING_TAGS as readonly string[]).includes(t));
    expect(playerOnlyTag).toBeTruthy();
    expect(() =>
      rateCampaignParticipant(campaign.id, player.id, dm.id, {
        stars: 5,
        tags: [playerOnlyTag as string],
      })
    ).toThrow(RatingError);
  });

  it("upserts on a second rating from the same rater instead of creating a duplicate", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "rate-dm7@example.com",
      "rate-player7@example.com"
    );
    const first = rateCampaignParticipant(campaign.id, player.id, dm.id, { stars: 3 });
    const second = rateCampaignParticipant(campaign.id, player.id, dm.id, {
      stars: 5,
      tags: ["Fair rulings"],
    });
    expect(second.id).toBe(first.id);
    expect(getRating(campaign.id, player.id, dm.id)?.stars).toBe(5);
    expect(getUserRatingSummary(dm.id).asDm.count).toBe(1);
  });

  it("still allows rating after the player has left the campaign", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "rate-dm8@example.com",
      "rate-player8@example.com"
    );
    leaveCampaign(campaign.id, player.id);
    const rating = rateCampaignParticipant(campaign.id, player.id, dm.id, { stars: 4 });
    expect(rating.stars).toBe(4);
    const dmRatingOfLeftPlayer = rateCampaignParticipant(campaign.id, dm.id, player.id, {
      stars: 5,
    });
    expect(dmRatingOfLeftPlayer.stars).toBe(5);
  });

  it("lists rating targets for the DM (all approved/left members) and for a player (just the DM)", () => {
    const dm = makeDm("rate-dm9@example.com");
    const p1 = signUp("P1", "rate-p1-9@example.com", "testpassword123");
    const p2 = signUp("P2", "rate-p2-9@example.com", "testpassword123");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    approveRequest(requestJoin(campaign.id, p1.id).id, dm.id);
    approveRequest(requestJoin(campaign.id, p2.id).id, dm.id);

    const dmView = ratingTargetsFor(campaign.id, dm.id);
    expect(dmView.role).toBe("dm");
    expect(dmView.targets.map((t) => t.userId).sort()).toEqual([p1.id, p2.id].sort());
    expect(dmView.targets.every((t) => t.existing === null)).toBe(true);

    const playerView = ratingTargetsFor(campaign.id, p1.id);
    expect(playerView.role).toBe("player");
    expect(playerView.targets.map((t) => t.userId)).toEqual([dm.id]);
  });

  it("returns a null role and empty targets for someone with no relationship to the campaign", () => {
    const dm = makeDm("rate-dm10@example.com");
    const stranger = signUp("Stranger", "rate-stranger10@example.com", "testpassword123");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    const view = ratingTargetsFor(campaign.id, stranger.id);
    expect(view.role).toBeNull();
    expect(view.targets).toHaveLength(0);
  });

  it("reports a brand-new user as unrated (null average), not a zero score", () => {
    const user = signUp("Fresh", "rate-fresh11@example.com", "testpassword123");
    const summary = getUserRatingSummary(user.id);
    expect(summary.asDm.average).toBeNull();
    expect(summary.asDm.count).toBe(0);
    expect(summary.asPlayer.average).toBeNull();
    expect(summary.asPlayer.count).toBe(0);
  });

  it("averages multiple ratings and tallies tag counts, split by role", () => {
    const dm = makeDm("rate-dm12@example.com");
    const p1 = signUp("P1", "rate-p1-12@example.com", "testpassword123");
    const p2 = signUp("P2", "rate-p2-12@example.com", "testpassword123");
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
    approveRequest(requestJoin(campaignA.id, p1.id).id, dm.id);
    approveRequest(requestJoin(campaignB.id, p2.id).id, dm.id);

    rateCampaignParticipant(campaignA.id, p1.id, dm.id, { stars: 5, tags: ["Great narrator"] });
    rateCampaignParticipant(campaignB.id, p2.id, dm.id, { stars: 3, tags: ["Great narrator", "On time"] });

    const summary = getUserRatingSummary(dm.id);
    expect(summary.asDm.count).toBe(2);
    expect(summary.asDm.average).toBe(4);
    expect(summary.asDm.tagCounts["Great narrator"]).toBe(2);
    expect(summary.asDm.tagCounts["On time"]).toBe(1);
    expect(summary.asPlayer.count).toBe(0);
  });

  it("sends a rating_prompt notification to both sides when a player leaves", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "rate-dm13@example.com",
      "rate-player13@example.com"
    );
    leaveCampaign(campaign.id, player.id);

    const playerNotifs = listNotifications(player.id).items.filter(
      (n) => n.type === "rating_prompt"
    );
    const dmNotifs = listNotifications(dm.id).items.filter((n) => n.type === "rating_prompt");
    expect(playerNotifs).toHaveLength(1);
    expect(dmNotifs).toHaveLength(1);
  });

  // Backlog #65: written free-text reviews, alongside the existing
  // star+tag ratings.
  it("stores and returns a written review alongside stars/tags", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "rate-dm14@example.com",
      "rate-player14@example.com"
    );
    const rating = rateCampaignParticipant(campaign.id, player.id, dm.id, {
      stars: 5,
      tags: ["Great narrator"],
      comment: "Ran a fantastic campaign, always well prepared.",
    });
    expect(rating.comment).toBe("Ran a fantastic campaign, always well prepared.");
    expect(getRating(campaign.id, player.id, dm.id)?.comment).toBe(
      "Ran a fantastic campaign, always well prepared."
    );
  });

  it("defaults comment to an empty string, never null, when omitted", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "rate-dm15@example.com",
      "rate-player15@example.com"
    );
    const rating = rateCampaignParticipant(campaign.id, player.id, dm.id, { stars: 4 });
    expect(rating.comment).toBe("");
  });

  it("trims surrounding whitespace from a comment", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "rate-dm16@example.com",
      "rate-player16@example.com"
    );
    const rating = rateCampaignParticipant(campaign.id, player.id, dm.id, {
      stars: 4,
      comment: "   Solid table.   ",
    });
    expect(rating.comment).toBe("Solid table.");
  });

  it("rejects a comment longer than MAX_COMMENT_LENGTH", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "rate-dm17@example.com",
      "rate-player17@example.com"
    );
    const tooLong = "x".repeat(MAX_COMMENT_LENGTH + 1);
    expect(() =>
      rateCampaignParticipant(campaign.id, player.id, dm.id, { stars: 4, comment: tooLong })
    ).toThrow(RatingError);
    const atLimit = "x".repeat(MAX_COMMENT_LENGTH);
    expect(() =>
      rateCampaignParticipant(campaign.id, player.id, dm.id, { stars: 4, comment: atLimit })
    ).not.toThrow();
  });

  it("updates the comment on an upsert, same as stars/tags", () => {
    const { dm, player, campaign } = setUpCampaignWithPlayer(
      "rate-dm18@example.com",
      "rate-player18@example.com"
    );
    rateCampaignParticipant(campaign.id, player.id, dm.id, { stars: 3, comment: "First pass." });
    rateCampaignParticipant(campaign.id, player.id, dm.id, { stars: 5, comment: "Revised after finale." });
    expect(getRating(campaign.id, player.id, dm.id)?.comment).toBe("Revised after finale.");
  });

  it("only surfaces reviews with a non-empty comment in the rating summary", () => {
    const dm = makeDm("rate-dm19@example.com");
    const p1 = signUp("P1", "rate-p1-19@example.com", "testpassword123");
    const p2 = signUp("P2", "rate-p2-19@example.com", "testpassword123");
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
    approveRequest(requestJoin(campaignA.id, p1.id).id, dm.id);
    approveRequest(requestJoin(campaignB.id, p2.id).id, dm.id);

    rateCampaignParticipant(campaignA.id, p1.id, dm.id, { stars: 5, comment: "Loved it." });
    rateCampaignParticipant(campaignB.id, p2.id, dm.id, { stars: 4 }); // no comment

    const summary = getUserRatingSummary(dm.id);
    expect(summary.asDm.count).toBe(2);
    expect(summary.asDm.reviews).toHaveLength(1);
    expect(summary.asDm.reviews[0]).toMatchObject({ raterId: p1.id, stars: 5, comment: "Loved it." });
  });

  it("orders reviews newest-first", () => {
    const dm = makeDm("rate-dm20@example.com");
    const p1 = signUp("P1", "rate-p1-20@example.com", "testpassword123");
    const p2 = signUp("P2", "rate-p2-20@example.com", "testpassword123");
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
    approveRequest(requestJoin(campaignA.id, p1.id).id, dm.id);
    approveRequest(requestJoin(campaignB.id, p2.id).id, dm.id);

    rateCampaignParticipant(campaignA.id, p1.id, dm.id, { stars: 3, comment: "First review." });
    rateCampaignParticipant(campaignB.id, p2.id, dm.id, { stars: 5, comment: "Second review." });

    const summary = getUserRatingSummary(dm.id);
    expect(summary.asDm.reviews.map((r) => r.comment)).toEqual(["Second review.", "First review."]);
  });
});
