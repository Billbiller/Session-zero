import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { CHARACTER_AVATARS } from "@/lib/types";
import {
  createCharacter,
  updateCharacter,
  deleteCharacter,
  getCharacter,
  listCharactersForUser,
  CharacterError,
} from "@/lib/characters";

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
});
