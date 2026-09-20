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
    expect(profile.session_format_preference).toBeNull();
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

  // Backlog #41 phase 1: the player-side session-format preference,
  // symmetric with a campaign's own session_format.
  it("lets session_format_preference be set, changed, and cleared independently of other fields", () => {
    const user = signUp("Format Fiona", "profile5e@example.com", "testpassword123");
    upsertProfile(user.id, { bio: "Some bio" });

    const set = upsertProfile(user.id, { sessionFormatPreference: "in_person" });
    expect(set.session_format_preference).toBe("in_person");
    expect(set.bio).toBe("Some bio");

    const changed = upsertProfile(user.id, { sessionFormatPreference: "either" });
    expect(changed.session_format_preference).toBe("either");
    expect(changed.bio).toBe("Some bio");

    const cleared = upsertProfile(user.id, { sessionFormatPreference: null });
    expect(cleared.session_format_preference).toBeNull();
    expect(cleared.bio).toBe("Some bio");
  });

  it("leaves session_format_preference untouched when omitted from an update", () => {
    const user = signUp("Format Gustav", "profile5f@example.com", "testpassword123");
    upsertProfile(user.id, { sessionFormatPreference: "remote" });
    const updated = upsertProfile(user.id, { bio: "New bio" });
    expect(updated.session_format_preference).toBe("remote");
  });

  it("rejects an unrecognized session_format_preference value", () => {
    const user = signUp("Format Helga", "profile5g@example.com", "testpassword123");
    expect(() =>
      upsertProfile(user.id, {
        // @ts-expect-error deliberately invalid for this test
        sessionFormatPreference: "spaceship",
      })
    ).toThrow(ProfileError);
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

  // Backlog #64 (owner-requested, live session): the player-side "types of
  // games they enjoy most" fields, reusing the exact same curated
  // vocabularies and validation rules as the campaign side (see
  // __tests__/unit/campaigns.test.ts's own "backlog #64" describe block).
  it("defaults the new preference fields to empty/null for a brand-new profile", () => {
    const user = signUp("Pref Default", "profile9-default@example.com", "testpassword123");
    const profile = getProfile(user.id);
    expect(profile.tone_tags).toEqual([]);
    expect(profile.setting_tags).toEqual([]);
    expect(profile.gameplay_focus_preference).toEqual([]);
    expect(profile.structure_preference).toBeNull();
    expect(profile.danger_level_preference).toBeNull();
  });

  it("sets, changes, and clears tone_tags and setting_tags", () => {
    const user = signUp("Pref Tags", "profile9-tags@example.com", "testpassword123");
    const set = upsertProfile(user.id, {
      toneTags: ["comedic", "exploration"],
      settingTags: ["urban"],
    });
    expect(set.tone_tags).toEqual(["comedic", "exploration"]);
    expect(set.setting_tags).toEqual(["urban"]);

    const changed = upsertProfile(user.id, { toneTags: ["horror"] });
    expect(changed.tone_tags).toEqual(["horror"]);
    expect(changed.setting_tags).toEqual(["urban"]);

    const cleared = upsertProfile(user.id, { toneTags: [], settingTags: [] });
    expect(cleared.tone_tags).toEqual([]);
    expect(cleared.setting_tags).toEqual([]);
  });

  it("rejects an unrecognized tone tag, setting tag, structure, or danger level preference", () => {
    const user = signUp("Pref Reject", "profile9-reject@example.com", "testpassword123");
    expect(() =>
      upsertProfile(user.id, { toneTags: ["not-a-real-tag"] })
    ).toThrow(ProfileError);
    expect(() =>
      upsertProfile(user.id, { settingTags: ["not-a-real-setting"] })
    ).toThrow(ProfileError);
    expect(() =>
      // @ts-expect-error deliberately invalid for this test
      upsertProfile(user.id, { structurePreference: "not-a-real-structure" })
    ).toThrow(ProfileError);
    expect(() =>
      // @ts-expect-error deliberately invalid for this test
      upsertProfile(user.id, { dangerLevelPreference: "not-a-real-level" })
    ).toThrow(ProfileError);
  });

  it("rejects more than the max allowed tone or setting tags", () => {
    const user = signUp("Pref Cap", "profile9-cap@example.com", "testpassword123");
    expect(() =>
      upsertProfile(user.id, {
        toneTags: [
          "horror",
          "heavy-combat",
          "roleplay-focused",
          "political-intrigue",
          "comedic",
          "mystery-investigation",
        ],
      })
    ).toThrow(ProfileError);
    expect(() =>
      upsertProfile(user.id, {
        settingTags: ["high-fantasy", "urban", "wilderness-frontier", "cosmic-planar"],
      })
    ).toThrow(ProfileError);
  });

  it("lets structure_preference and danger_level_preference be set, changed, and cleared", () => {
    const user = signUp("Pref Enum", "profile9-enum@example.com", "testpassword123");
    const set = upsertProfile(user.id, {
      structurePreference: "sandbox",
      dangerLevelPreference: "moderate",
    });
    expect(set.structure_preference).toBe("sandbox");
    expect(set.danger_level_preference).toBe("moderate");

    const changed = upsertProfile(user.id, {
      structurePreference: "linear",
      dangerLevelPreference: "deadly-osr",
    });
    expect(changed.structure_preference).toBe("linear");
    expect(changed.danger_level_preference).toBe("deadly-osr");

    const cleared = upsertProfile(user.id, {
      structurePreference: null,
      dangerLevelPreference: null,
    });
    expect(cleared.structure_preference).toBeNull();
    expect(cleared.danger_level_preference).toBeNull();
  });

  it("accepts an empty gameplay_focus_preference but rejects a partial ranking", () => {
    const user = signUp("Pref Focus", "profile9-focus@example.com", "testpassword123");
    const empty = upsertProfile(user.id, { gameplayFocusPreference: [] });
    expect(empty.gameplay_focus_preference).toEqual([]);

    expect(() =>
      upsertProfile(user.id, { gameplayFocusPreference: ["combat", "roleplay"] })
    ).toThrow(ProfileError);
  });

  it("sets a full gameplay_focus_preference ranking and leaves it untouched when omitted", () => {
    const user = signUp("Pref Focus Full", "profile9-focus-full@example.com", "testpassword123");
    const set = upsertProfile(user.id, {
      gameplayFocusPreference: ["roleplay", "exploration", "combat"],
    });
    expect(set.gameplay_focus_preference).toEqual(["roleplay", "exploration", "combat"]);

    const updated = upsertProfile(user.id, { bio: "New bio" });
    expect(updated.gameplay_focus_preference).toEqual(["roleplay", "exploration", "combat"]);
  });

  it("round-trips all five preference fields through a fresh read", () => {
    const user = signUp("Pref Roundtrip", "profile9-roundtrip@example.com", "testpassword123");
    const saved = upsertProfile(user.id, {
      toneTags: ["mystery-investigation"],
      settingTags: ["cosmic-planar"],
      gameplayFocusPreference: ["exploration", "roleplay", "combat"],
      structurePreference: "episodic",
      dangerLevelPreference: "low-lethality",
    });
    const reread = getProfile(user.id);
    expect(reread).toEqual(saved);
  });
});
