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
  getCampaignChronicle,
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

  it("defaults a new character to active status and an empty epilogue", () => {
    const user = signUp("Fresh", "char-status1@example.com", "testpassword123");
    const character = createCharacter(user.id, { name: "Newborn" });
    expect(character.status).toBe("active");
    expect(character.epilogue).toBe("");
  });

  it("lets a character be created directly as retired or fallen with an epilogue", () => {
    const user = signUp("Vet", "char-status2@example.com", "testpassword123");
    const character = createCharacter(user.id, {
      name: "Old Soldier",
      status: "retired",
      epilogue: "Hung up the sword after the war ended.",
    });
    expect(character.status).toBe("retired");
    expect(character.epilogue).toBe("Hung up the sword after the war ended.");
  });

  it("lets the owner update a character's status and epilogue independently of other fields", () => {
    const user = signUp("Owner", "char-status3@example.com", "testpassword123");
    const character = createCharacter(user.id, { name: "Doomed" });

    const fallen = updateCharacter(character.id, user.id, {
      status: "fallen",
      epilogue: "Died holding the bridge so the others could escape.",
    });
    expect(fallen.status).toBe("fallen");
    expect(fallen.epilogue).toBe("Died holding the bridge so the others could escape.");
    // Untouched fields stay as they were.
    expect(fallen.name).toBe("Doomed");
  });

  it("rejects an epilogue longer than the max length", () => {
    const user = signUp("Verbose", "char-status4@example.com", "testpassword123");
    expect(() =>
      createCharacter(user.id, { name: "TooMuch", epilogue: "x".repeat(2001) })
    ).toThrow(CharacterError);
  });

  it("ignores an unrecognized status value and falls back to the current/default status", () => {
    const user = signUp("Cautious", "char-status5@example.com", "testpassword123");
    // @ts-expect-error deliberately passing an invalid status to prove it's rejected gracefully
    const created = createCharacter(user.id, { name: "Steady", status: "haunted" });
    expect(created.status).toBe("active");
  });

  it("aggregates a campaign's chronicle by character status among currently linked characters", () => {
    const dm = makeDm("char-chron1-dm@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "Chronicle Test",
      description: "",
      system: "S",
      capacity: 4,
    });
    expect(getCampaignChronicle(campaign.id)).toEqual({
      active: 0,
      retired: 0,
      fallen: 0,
      total: 0,
    });

    createCharacter(dm.id, { name: "Alive", campaignId: campaign.id });
    createCharacter(dm.id, { name: "Retiree", campaignId: campaign.id, status: "retired" });
    createCharacter(dm.id, { name: "Ghost1", campaignId: campaign.id, status: "fallen" });
    createCharacter(dm.id, { name: "Ghost2", campaignId: campaign.id, status: "fallen" });
    createCharacter(dm.id, { name: "Elsewhere" }); // unlinked, shouldn't count

    expect(getCampaignChronicle(campaign.id)).toEqual({
      active: 1,
      retired: 1,
      fallen: 2,
      total: 4,
    });
  });

  it("drops a character out of a campaign's chronicle once unlinked", () => {
    const dm = makeDm("char-chron2-dm@example.com");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "Chronicle Test 2",
      description: "",
      system: "S",
      capacity: 4,
    });
    const character = createCharacter(dm.id, { name: "Temp", campaignId: campaign.id, status: "fallen" });
    expect(getCampaignChronicle(campaign.id).total).toBe(1);

    updateCharacter(character.id, dm.id, { campaignId: null });
    expect(getCampaignChronicle(campaign.id)).toEqual({
      active: 0,
      retired: 0,
      fallen: 0,
      total: 0,
    });
  });

  it("defaults a new character's portrait to null (falls back to the emoji avatar)", () => {
    const user = signUp("NoPortrait", "char-portrait1@example.com", "testpassword123");
    const character = createCharacter(user.id, { name: "Plain" });
    expect(character.portrait_data_url).toBeNull();
  });

  it("lets a character be created with a valid portrait data URL", () => {
    const user = signUp("Painter", "char-portrait2@example.com", "testpassword123");
    const dataUrl = "data:image/png;base64," + "A".repeat(100);
    const character = createCharacter(user.id, { name: "Portrayed", portraitDataUrl: dataUrl });
    expect(character.portrait_data_url).toBe(dataUrl);
  });

  it("rejects a portrait that isn't a recognized image data URL", () => {
    const user = signUp("Faker", "char-portrait3@example.com", "testpassword123");
    expect(() =>
      createCharacter(user.id, { name: "Bad", portraitDataUrl: "not-a-data-url" })
    ).toThrow(CharacterError);
    expect(() =>
      createCharacter(user.id, {
        name: "Bad2",
        portraitDataUrl: "data:text/plain;base64,aGVsbG8=",
      })
    ).toThrow(CharacterError);
  });

  it("rejects a portrait data URL over the max length", () => {
    const user = signUp("Hoarder", "char-portrait4@example.com", "testpassword123");
    const tooLong = "data:image/png;base64," + "A".repeat(300_000);
    expect(() =>
      createCharacter(user.id, { name: "TooBig", portraitDataUrl: tooLong })
    ).toThrow(CharacterError);
  });

  it("lets the owner set, replace, and remove a portrait via update", () => {
    const user = signUp("Editor", "char-portrait5@example.com", "testpassword123");
    const character = createCharacter(user.id, { name: "Evolving" });
    expect(character.portrait_data_url).toBeNull();

    const first = "data:image/jpeg;base64," + "B".repeat(50);
    const withPortrait = updateCharacter(character.id, user.id, { portraitDataUrl: first });
    expect(withPortrait.portrait_data_url).toBe(first);

    const second = "data:image/webp;base64," + "C".repeat(50);
    const replaced = updateCharacter(character.id, user.id, { portraitDataUrl: second });
    expect(replaced.portrait_data_url).toBe(second);

    const removed = updateCharacter(character.id, user.id, { portraitDataUrl: null });
    expect(removed.portrait_data_url).toBeNull();
  });

  it("leaves an existing portrait untouched when omitted from an update", () => {
    const user = signUp("Consistent", "char-portrait6@example.com", "testpassword123");
    const dataUrl = "data:image/gif;base64," + "D".repeat(50);
    const character = createCharacter(user.id, { name: "Steady", portraitDataUrl: dataUrl });
    const updated = updateCharacter(character.id, user.id, { bio: "New bio" });
    expect(updated.portrait_data_url).toBe(dataUrl);
  });
});
