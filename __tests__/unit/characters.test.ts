import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest } from "@/lib/memberships";
import { CHARACTER_AVATARS } from "@/lib/types";
import {
  createCharacter,
  updateCharacter,
  deleteCharacter,
  getCharacter,
  listCharactersForUser,
  listCharactersForCampaign,
  CharacterError,
} from "@/lib/characters";

function makeDm(email: string) {
  return signUp("DM " + email, email, "testpassword123");
}

describe("characters", () => {
  it("creates a character with a deterministic default avatar when none is given", () => {
    const user = signUp("Alice", "char1@example.com", "testpassword123");
    const character = createCharacter(user.id, { name: "Zaltha the Bold" });
    expect(character.name).toBe("Zaltha the Bold");
    expect(character.archetype).toBe("");
    expect(character.bio).toBe("");
    expect(character.backstory).toBe("");
    expect(CHARACTER_AVATARS as readonly string[]).toContain(character.avatar_emoji);
    expect(character.user_id).toBe(user.id);

    // Same name -> same deterministic default avatar.
    const again = createCharacter(user.id, { name: "Zaltha the Bold" });
    expect(again.avatar_emoji).toBe(character.avatar_emoji);
  });

  it("trims fields and stores an explicitly chosen avatar", () => {
    const user = signUp("Bob", "char2@example.com", "testpassword123");
    const chosen = CHARACTER_AVATARS[3];
    const character = createCharacter(user.id, {
      name: "  Borin Stonefist  ",
      archetype: "  Level 5 Ranger  ",
      bio: "  Gruff but loyal.  ",
      backstory: "  Grew up in the mountains.  ",
      avatarEmoji: chosen,
    });
    expect(character.name).toBe("Borin Stonefist");
    expect(character.archetype).toBe("Level 5 Ranger");
    expect(character.bio).toBe("Gruff but loyal.");
    expect(character.backstory).toBe("Grew up in the mountains.");
    expect(character.avatar_emoji).toBe(chosen);
  });

  it("rejects a blank name", () => {
    const user = signUp("Carl", "char3@example.com", "testpassword123");
    expect(() => createCharacter(user.id, { name: "   " })).toThrow(CharacterError);
  });

  it("rejects fields over their length limits", () => {
    const user = signUp("Dana", "char4@example.com", "testpassword123");
    expect(() => createCharacter(user.id, { name: "x".repeat(101) })).toThrow(
      CharacterError
    );
    expect(() =>
      createCharacter(user.id, { name: "Ok", archetype: "x".repeat(151) })
    ).toThrow(CharacterError);
    expect(() =>
      createCharacter(user.id, { name: "Ok", bio: "x".repeat(1001) })
    ).toThrow(CharacterError);
    expect(() =>
      createCharacter(user.id, { name: "Ok", backstory: "x".repeat(4001) })
    ).toThrow(CharacterError);
  });

  it("falls back to a default avatar for an unrecognized avatarEmoji value", () => {
    const user = signUp("Eve", "char5@example.com", "testpassword123");
    const character = createCharacter(user.id, {
      name: "Fenwick",
      avatarEmoji: "not-a-real-emoji",
    });
    expect(CHARACTER_AVATARS as readonly string[]).toContain(character.avatar_emoji);
  });

  it("lists a user's characters newest first and isolated per user", () => {
    const a = signUp("Frank", "char6a@example.com", "testpassword123");
    const b = signUp("Grace", "char6b@example.com", "testpassword123");
    const first = createCharacter(a.id, { name: "First" });
    const second = createCharacter(a.id, { name: "Second" });
    createCharacter(b.id, { name: "Other user's character" });

    const listing = listCharactersForUser(a.id);
    expect(listing.map((c) => c.id)).toEqual([second.id, first.id]);
    expect(listing.every((c) => c.user_id === a.id)).toBe(true);
  });

  it("updates a character with a partial payload, leaving other fields intact", () => {
    const user = signUp("Heidi", "char7@example.com", "testpassword123");
    const character = createCharacter(user.id, {
      name: "Original",
      archetype: "Fighter",
      bio: "Original bio",
    });
    const updated = updateCharacter(character.id, user.id, { bio: "Updated bio" });
    expect(updated.name).toBe("Original");
    expect(updated.archetype).toBe("Fighter");
    expect(updated.bio).toBe("Updated bio");
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(character.updated_at).getTime()
    );
  });

  it("prevents editing or deleting another user's character", () => {
    const owner = signUp("Ivan", "char8-owner@example.com", "testpassword123");
    const intruder = signUp("Judy", "char8-intruder@example.com", "testpassword123");
    const character = createCharacter(owner.id, { name: "Guarded" });

    expect(() =>
      updateCharacter(character.id, intruder.id, { name: "Hijacked" })
    ).toThrow(CharacterError);
    expect(() => deleteCharacter(character.id, intruder.id)).toThrow(CharacterError);

    // Unchanged after the failed attempts.
    expect(getCharacter(character.id)?.name).toBe("Guarded");
  });

  it("deletes a character", () => {
    const user = signUp("Karl", "char9@example.com", "testpassword123");
    const character = createCharacter(user.id, { name: "Doomed" });
    deleteCharacter(character.id, user.id);
    expect(getCharacter(character.id)).toBeNull();
  });

  it("throws when updating or deleting a character that doesn't exist", () => {
    const user = signUp("Liam", "char10@example.com", "testpassword123");
    expect(() => updateCharacter("nonexistent-id", user.id, { name: "X" })).toThrow(
      CharacterError
    );
    expect(() => deleteCharacter("nonexistent-id", user.id)).toThrow(CharacterError);
  });

  // --- campaign-linking (merged in from the parallel campaign-scoped design) ---

  it("creates a character already linked to a campaign the user is DMing", () => {
    const dm = makeDm("char-link1@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    const character = createCharacter(dm.id, { name: "Linked", campaignId: campaign.id });
    expect(character.campaign_id).toBe(campaign.id);
  });

  it("creates a character linked to a campaign the user is an approved player in", () => {
    const dm = makeDm("char-link2-dm@example.com");
    const player = signUp("Player", "char-link2-player@example.com", "testpassword123");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    const membership = requestJoin(campaign.id, player.id);
    approveRequest(membership.id, dm.id);

    const character = createCharacter(player.id, { name: "Linked", campaignId: campaign.id });
    expect(character.campaign_id).toBe(campaign.id);
  });

  it("rejects linking a character to a campaign the user has no access to", () => {
    const dm = makeDm("char-link3-dm@example.com");
    const stranger = signUp("Stranger", "char-link3-stranger@example.com", "testpassword123");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    expect(() =>
      createCharacter(stranger.id, { name: "Nope", campaignId: campaign.id })
    ).toThrow(CharacterError);
  });

  it("rejects linking to a nonexistent campaign", () => {
    const user = signUp("Nora", "char-link4@example.com", "testpassword123");
    expect(() =>
      createCharacter(user.id, { name: "Nope", campaignId: "no-such-campaign" })
    ).toThrow(CharacterError);
  });

  it("creates an unlinked character by default", () => {
    const user = signUp("Oscar", "char-link5@example.com", "testpassword123");
    const character = createCharacter(user.id, { name: "Freelancer" });
    expect(character.campaign_id).toBeNull();
  });

  it("lets the owner link, relink, and unlink a character via update", () => {
    const dm = makeDm("char-link6-dm@example.com");
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
    const character = createCharacter(dm.id, { name: "Nomad" });
    expect(character.campaign_id).toBeNull();

    const linked = updateCharacter(character.id, dm.id, { campaignId: campaignA.id });
    expect(linked.campaign_id).toBe(campaignA.id);

    const relinked = updateCharacter(character.id, dm.id, { campaignId: campaignB.id });
    expect(relinked.campaign_id).toBe(campaignB.id);

    const unlinked = updateCharacter(character.id, dm.id, { campaignId: null });
    expect(unlinked.campaign_id).toBeNull();
  });

  it("rejects relinking to a campaign the owner doesn't have access to, leaving the existing link intact", () => {
    const dm = makeDm("char-link7-dm@example.com");
    const otherDm = makeDm("char-link7-other@example.com");
    const ownCampaign = createCampaign({
      dmId: dm.id,
      title: "Own",
      description: "",
      system: "S",
      capacity: 4,
    });
    const otherCampaign = createCampaign({
      dmId: otherDm.id,
      title: "Other",
      description: "",
      system: "S",
      capacity: 4,
    });
    const character = createCharacter(dm.id, { name: "Loyal", campaignId: ownCampaign.id });

    expect(() =>
      updateCharacter(character.id, dm.id, { campaignId: otherCampaign.id })
    ).toThrow(CharacterError);
    expect(getCharacter(character.id)?.campaign_id).toBe(ownCampaign.id);
  });

  it("omitting campaignId on update leaves the existing link untouched", () => {
    const dm = makeDm("char-link8-dm@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    const character = createCharacter(dm.id, { name: "Steady", campaignId: campaign.id });
    const updated = updateCharacter(character.id, dm.id, { bio: "New bio" });
    expect(updated.campaign_id).toBe(campaign.id);
  });

  it("lists only characters linked to a given campaign, oldest first", () => {
    const dm = makeDm("char-link9-dm@example.com");
    const player = signUp("Player", "char-link9-player@example.com", "testpassword123");
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
    const membership = requestJoin(campaignA.id, player.id);
    approveRequest(membership.id, dm.id);

    const first = createCharacter(dm.id, { name: "First", campaignId: campaignA.id });
    const second = createCharacter(player.id, { name: "Second", campaignId: campaignA.id });
    createCharacter(dm.id, { name: "Elsewhere", campaignId: campaignB.id });
    createCharacter(dm.id, { name: "Unlinked" });

    const listing = listCharactersForCampaign(campaignA.id);
    expect(listing.map((c) => c.id)).toEqual([first.id, second.id]);
  });
});
