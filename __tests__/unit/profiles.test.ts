import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest, declineRequest, leaveCampaign } from "@/lib/memberships";
import {
  getProfile,
  upsertProfile,
  splitPreferredSystems,
  myCampaigns,
  ProfileError,
} from "@/lib/profiles";

describe("profiles", () => {
  it("returns an empty default profile for a brand-new user with no saved row", () => {
    const user = signUp("Alice", "profile1@example.com", "testpassword123");
    const profile = getProfile(user.id);
    expect(profile.bio).toBe("");
    expect(profile.preferred_systems).toBe("");
    expect(profile.availability).toBe("");
    expect(profile.location).toBe("");
    expect(profile.new_to_tabletop).toBe(0);
    expect(profile.updated_at).toBeNull();
  });

  it("saves and re-reads a profile, trimming whitespace", () => {
    const user = signUp("Bob", "profile2@example.com", "testpassword123");
    const saved = upsertProfile(user.id, {
      bio: "  Loves gothic horror campaigns.  ",
      preferredSystems: "  D&D 5e, Pathfinder 2e  ",
      availability: "  Weeknights after 7pm ET  ",
      location: "  Austin, TX  ",
      newToTabletop: true,
    });
    expect(saved.bio).toBe("Loves gothic horror campaigns.");
    expect(saved.preferred_systems).toBe("D&D 5e, Pathfinder 2e");
    expect(saved.availability).toBe("Weeknights after 7pm ET");
    expect(saved.location).toBe("Austin, TX");
    expect(saved.new_to_tabletop).toBe(1);
    expect(saved.updated_at).not.toBeNull();

    const reread = getProfile(user.id);
    expect(reread).toEqual(saved);
  });

  it("lets a partial update change one field without clobbering the others", () => {
    const user = signUp("Carl", "profile3@example.com", "testpassword123");
    upsertProfile(user.id, {
      bio: "Original bio",
      preferredSystems: "D&D 5e",
      availability: "Saturdays",
    });
    const updated = upsertProfile(user.id, { bio: "Updated bio" });
    expect(updated.bio).toBe("Updated bio");
    expect(updated.preferred_systems).toBe("D&D 5e");
    expect(updated.availability).toBe("Saturdays");
  });

  it("rejects a bio over the length limit", () => {
    const user = signUp("Dana", "profile4@example.com", "testpassword123");
    expect(() => upsertProfile(user.id, { bio: "x".repeat(2001) })).toThrow(ProfileError);
  });

  it("rejects preferred systems and availability over their length limits", () => {
    const user = signUp("Eve", "profile5@example.com", "testpassword123");
    expect(() =>
      upsertProfile(user.id, { preferredSystems: "x".repeat(301) })
    ).toThrow(ProfileError);
    expect(() => upsertProfile(user.id, { availability: "x".repeat(301) })).toThrow(
      ProfileError
    );
  });

  it("rejects a location over its length limit", () => {
    const user = signUp("Location Eve", "profile5b@example.com", "testpassword123");
    expect(() => upsertProfile(user.id, { location: "x".repeat(201) })).toThrow(ProfileError);
  });

  it("lets new_to_tabletop be set and cleared independently of other fields", () => {
    const user = signUp("Flagged Frank", "profile5c@example.com", "testpassword123");
    upsertProfile(user.id, { bio: "Some bio" });
    const flagged = upsertProfile(user.id, { newToTabletop: true });
    expect(flagged.new_to_tabletop).toBe(1);
    expect(flagged.bio).toBe("Some bio");

    const cleared = upsertProfile(user.id, { newToTabletop: false });
    expect(cleared.new_to_tabletop).toBe(0);
    expect(cleared.bio).toBe("Some bio");
  });

  it("leaves new_to_tabletop untouched when omitted from an update", () => {
    const user = signUp("Untouched Uma", "profile5d@example.com", "testpassword123");
    upsertProfile(user.id, { newToTabletop: true });
    const updated = upsertProfile(user.id, { bio: "New bio" });
    expect(updated.new_to_tabletop).toBe(1);
  });

  it("does not affect another user's profile", () => {
    const a = signUp("Frank", "profile6a@example.com", "testpassword123");
    const b = signUp("Grace", "profile6b@example.com", "testpassword123");
    upsertProfile(a.id, { bio: "Frank's bio" });
    expect(getProfile(a.id).bio).toBe("Frank's bio");
    expect(getProfile(b.id).bio).toBe("");
  });

  it("splits a comma-separated preferred-systems string into trimmed, non-empty entries", () => {
    expect(splitPreferredSystems("D&D 5e, Pathfinder 2e,  , Call of Cthulhu,")).toEqual([
      "D&D 5e",
      "Pathfinder 2e",
      "Call of Cthulhu",
    ]);
    expect(splitPreferredSystems("")).toEqual([]);
  });

  it("lists campaigns a user is DMing separately from campaigns they're an active player in", () => {
    const dm = signUp("Heidi", "profile7-dm@example.com", "testpassword123");
    const player = signUp("Ivan", "profile7-player@example.com", "testpassword123");

    const dmCampaign = createCampaign({
      dmId: dm.id,
      title: "Heidi's Homebrew",
      description: "",
      system: "Unique Profile System A",
      capacity: 4,
    });
    const playerCampaign = createCampaign({
      dmId: dm.id,
      title: "Heidi's Dungeon Delve",
      description: "",
      system: "Unique Profile System B",
      capacity: 4,
    });
    const membership = requestJoin(playerCampaign.id, player.id);
    approveRequest(membership.id, dm.id);

    const dmView = myCampaigns(dm.id);
    expect(dmView.dming.map((c) => c.id).sort()).toEqual(
      [dmCampaign.id, playerCampaign.id].sort()
    );
    expect(dmView.playing).toHaveLength(0);

    const playerView = myCampaigns(player.id);
    expect(playerView.playing.map((c) => c.id)).toEqual([playerCampaign.id]);
    expect(playerView.dming).toHaveLength(0);
  });

  it("excludes pending, declined, and left memberships from the playing list", () => {
    const dm = signUp("Karl", "profile8-dm@example.com", "testpassword123");
    const pendingPlayer = signUp("Liam", "profile8-pending@example.com", "testpassword123");
    const declinedPlayer = signUp("Nora", "profile8-declined@example.com", "testpassword123");
    const leftPlayer = signUp("Mona", "profile8-left@example.com", "testpassword123");

    const campaign = createCampaign({
      dmId: dm.id,
      title: "Karl's Campaign",
      description: "",
      system: "Unique Profile System C",
      capacity: 4,
    });

    requestJoin(campaign.id, pendingPlayer.id);
    expect(myCampaigns(pendingPlayer.id).playing).toHaveLength(0);

    const declinedMembership = requestJoin(campaign.id, declinedPlayer.id);
    declineRequest(declinedMembership.id, dm.id);
    expect(myCampaigns(declinedPlayer.id).playing).toHaveLength(0);

    const leftMembership = requestJoin(campaign.id, leftPlayer.id);
    approveRequest(leftMembership.id, dm.id);
    expect(myCampaigns(leftPlayer.id).playing).toHaveLength(1);
    leaveCampaign(campaign.id, leftPlayer.id);
    expect(myCampaigns(leftPlayer.id).playing).toHaveLength(0);
  });
});
