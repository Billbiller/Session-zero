import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest } from "@/lib/memberships";
import { createCharacter, updateCharacter, deleteCharacter } from "@/lib/characters";
import { createEntry } from "@/lib/sessionLog";
import { rateCampaign } from "@/lib/campaignRatings";
import { follow, unfollow, isFollowing, listFollowingIds, followerCount, followingCount, FollowError } from "@/lib/follows";
import { listFeed } from "@/lib/feed";

function makeUser(prefix: string) {
  return signUp(prefix, `${prefix}@example.com`, "testpassword123");
}

describe("follows (backlog #38)", () => {
  it("lets one signed-in user follow another", () => {
    const a = makeUser("fl1a");
    const b = makeUser("fl1b");
    const row = follow(a.id, b.id);
    expect(row.follower_id).toBe(a.id);
    expect(row.followed_id).toBe(b.id);
    expect(isFollowing(a.id, b.id)).toBe(true);
    expect(isFollowing(b.id, a.id)).toBe(false);
  });

  it("rejects following yourself", () => {
    const a = makeUser("fl2a");
    expect(() => follow(a.id, a.id)).toThrow(FollowError);
  });

  it("rejects following a nonexistent user", () => {
    const a = makeUser("fl3a");
    expect(() => follow(a.id, "not-a-real-id")).toThrow(FollowError);
  });

  it("rejects following the same person twice", () => {
    const a = makeUser("fl4a");
    const b = makeUser("fl4b");
    follow(a.id, b.id);
    expect(() => follow(a.id, b.id)).toThrow(FollowError);
  });

  it("does NOT require any shared campaign/relationship -- an explicit, documented judgment call matching backlog #31's messaging precedent", () => {
    const a = makeUser("fl5a");
    const b = makeUser("fl5b");
    // a and b have never shared a campaign, never messaged, nothing --
    // follow() still succeeds, by design.
    expect(() => follow(a.id, b.id)).not.toThrow();
  });

  it("unfollow is idempotent -- a no-op when not currently following", () => {
    const a = makeUser("fl6a");
    const b = makeUser("fl6b");
    expect(() => unfollow(a.id, b.id)).not.toThrow();
    follow(a.id, b.id);
    unfollow(a.id, b.id);
    expect(isFollowing(a.id, b.id)).toBe(false);
    expect(() => unfollow(a.id, b.id)).not.toThrow();
  });

  it("lists every id a user follows, and counts followers/following correctly", () => {
    const a = makeUser("fl7a");
    const b = makeUser("fl7b");
    const c = makeUser("fl7c");
    follow(a.id, b.id);
    follow(a.id, c.id);
    follow(b.id, c.id);
    expect(listFollowingIds(a.id).sort()).toEqual([b.id, c.id].sort());
    expect(followingCount(a.id)).toBe(2);
    expect(followerCount(c.id)).toBe(2);
    expect(followerCount(b.id)).toBe(1);
    expect(followerCount(a.id)).toBe(0);
  });
});

describe("activity feed (backlog #38)", () => {
  it("surfaces a followed user's new character as a feed event", () => {
    const viewer = makeUser("fd1v");
    const followed = makeUser("fd1f");
    follow(viewer.id, followed.id);
    const character = createCharacter(followed.id, { name: "Thistle Bramblewick" });

    const { items, total } = listFeed(viewer.id);
    expect(total).toBe(1);
    expect(items[0].type).toBe("character_created");
    expect(items[0].actor_id).toBe(followed.id);
    expect(items[0].actorName).toBe(followed.display_name);
    expect(items[0].character_id).toBe(character.id);
    expect(items[0].message).toContain("Thistle Bramblewick");
  });

  it("surfaces a character reaching retired/fallen status, but not other edits or a transition back to active", () => {
    const viewer = makeUser("fd2v");
    const followed = makeUser("fd2f");
    follow(viewer.id, followed.id);
    const character = createCharacter(followed.id, { name: "Korrick" });

    // A plain bio edit (status unchanged) should NOT add a new event.
    updateCharacter(character.id, followed.id, { bio: "A quiet fellow." });
    expect(listFeed(viewer.id).total).toBe(1); // just character_created

    updateCharacter(character.id, followed.id, { status: "retired" });
    const afterRetire = listFeed(viewer.id);
    expect(afterRetire.total).toBe(2);
    expect(afterRetire.items[0].type).toBe("character_status_changed");
    expect(afterRetire.items[0].message).toContain("retired");

    // Flipping back to active is not itself a feed-worthy milestone.
    updateCharacter(character.id, followed.id, { status: "active" });
    expect(listFeed(viewer.id).total).toBe(2);

    updateCharacter(character.id, followed.id, { status: "fallen" });
    const afterFall = listFeed(viewer.id);
    expect(afterFall.total).toBe(3);
    expect(afterFall.items[0].type).toBe("character_status_changed");
    expect(afterFall.items[0].message).toContain("fallen");
  });

  it("surfaces a DM's campaign becoming full, only on the actual open -> full transition", () => {
    const viewer = makeUser("fd3v");
    const dm = makeUser("fd3dm");
    follow(viewer.id, dm.id);
    const campaign = createCampaign({
      dmId: dm.id,
      title: "The Sunken Keep",
      description: "",
      system: "S",
      capacity: 1,
    });
    const p1 = makeUser("fd3p1");
    const m1 = requestJoin(campaign.id, p1.id);
    approveRequest(m1.id, dm.id); // fills the one and only seat

    const { items, total } = listFeed(viewer.id);
    expect(total).toBe(1);
    expect(items[0].type).toBe("campaign_became_full");
    expect(items[0].actor_id).toBe(dm.id);
    expect(items[0].campaign_id).toBe(campaign.id);
  });

  it("surfaces a campaign's first public rating, but not a second rating from someone else", () => {
    const viewer = makeUser("fd4v");
    const dm = makeUser("fd4dm");
    follow(viewer.id, dm.id);
    const campaign = createCampaign({
      dmId: dm.id,
      title: "Beneath the Barrowmoor",
      description: "",
      system: "S",
      capacity: 4,
    });
    const p1 = makeUser("fd4p1");
    const p2 = makeUser("fd4p2");
    for (const p of [p1, p2]) {
      const m = requestJoin(campaign.id, p.id);
      approveRequest(m.id, dm.id);
    }

    rateCampaign(campaign.id, p1.id, { stars: 5 });
    let feed = listFeed(viewer.id);
    expect(feed.total).toBe(1);
    expect(feed.items[0].type).toBe("campaign_first_rated");

    rateCampaign(campaign.id, p2.id, { stars: 4 });
    feed = listFeed(viewer.id);
    expect(feed.total).toBe(1); // no second campaign_first_rated event
  });

  it("only surfaces events from followed users, newest first, paginated", () => {
    const viewer = makeUser("fd5v");
    const followed = makeUser("fd5f");
    const stranger = makeUser("fd5s");
    follow(viewer.id, followed.id);
    // Stranger's events must never appear, even though they exist.
    createCharacter(stranger.id, { name: "Not Followed" });

    for (let i = 0; i < 3; i++) {
      createCharacter(followed.id, { name: `Character ${i}` });
    }
    const page1 = listFeed(viewer.id, { page: 1, pageSize: 2 });
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page1.items[0].message).toContain("Character 2");
    expect(page1.items[1].message).toContain("Character 1");

    const page2 = listFeed(viewer.id, { page: 2, pageSize: 2 });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].message).toContain("Character 0");
  });

  it("returns an empty feed for a user who follows nobody", () => {
    const viewer = makeUser("fd6v");
    const someone = makeUser("fd6s");
    createCharacter(someone.id, { name: "Irrelevant" });
    const { items, total } = listFeed(viewer.id);
    expect(items).toEqual([]);
    expect(total).toBe(0);
  });

  it("deleting a character nulls out its feed event's character_id rather than breaking the FK reference or losing the event", () => {
    const viewer = makeUser("fd9v");
    const followed = makeUser("fd9f");
    follow(viewer.id, followed.id);
    const character = createCharacter(followed.id, { name: "Soon Deleted" });
    expect(listFeed(viewer.id).total).toBe(1);

    deleteCharacter(character.id, followed.id);

    const { items, total } = listFeed(viewer.id);
    expect(total).toBe(1);
    expect(items[0].character_id).toBeNull();
    expect(items[0].message).toContain("Soon Deleted");
  });

  it("unfollowing someone removes their past events from the feed", () => {
    const viewer = makeUser("fd7v");
    const followed = makeUser("fd7f");
    follow(viewer.id, followed.id);
    createCharacter(followed.id, { name: "Gone Soon" });
    expect(listFeed(viewer.id).total).toBe(1);
    unfollow(viewer.id, followed.id);
    expect(listFeed(viewer.id).total).toBe(0);
  });

  it("PRIVACY BOUNDARY: never surfaces private, campaign-scoped session log content for a non-member follower -- only genuinely public profile-level events", () => {
    const viewer = makeUser("fd8v");
    const dm = makeUser("fd8dm");
    follow(viewer.id, dm.id);

    const campaign = createCampaign({
      dmId: dm.id,
      title: "A Secret Table",
      description: "",
      system: "S",
      capacity: 4,
    });
    // The viewer is NOT a member of this campaign -- hasPrivateAccess(viewer.id, campaign.id) is false.
    // The DM posts a session log entry containing content that must never
    // leak to a non-member, per this app's own existing, tested private-
    // side boundary (lib/access.ts's hasPrivateAccess).
    createEntry(campaign.id, dm.id, "The party discovered the secret entrance behind the waterfall.");

    const { items, total } = listFeed(viewer.id);
    // The DM's campaign creation/session-log posting produced no feed
    // event at all -- session log entries are never written to
    // feed_events (see lib/feed.ts and lib/db.ts's feed_events comment),
    // so there is nothing here for a leak to even be possible from.
    expect(total).toBe(0);
    expect(items).toEqual([]);
  });
});
