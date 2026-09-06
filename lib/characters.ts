import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { CHARACTER_AVATARS, type Character } from "./types";

export class CharacterError extends Error {}

const MAX_NAME = 100;
const MAX_ARCHETYPE = 150;
const MAX_BIO = 1000;
const MAX_BACKSTORY = 4000;

// Re-exported so existing server-side callers (API routes) can import the
// avatar set from this module too — but client components must import it
// from "./types" instead, since this module pulls in better-sqlite3 via
// "./db" and can't be bundled for the browser.
export { CHARACTER_AVATARS };

const DEFAULT_AVATAR: string = "🎲";

function isKnownAvatar(value: string): boolean {
  return (CHARACTER_AVATARS as readonly string[]).includes(value);
}

/** Deterministic pick from the curated set so two characters with the same
 * name always default to the same portrait, without needing a stored
 * "unset" state — every character has a real avatar_emoji from creation. */
function defaultAvatarFor(name: string): string {
  if (!name) return DEFAULT_AVATAR;
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return CHARACTER_AVATARS[sum % CHARACTER_AVATARS.length];
}

function defaultCharacterRow(): Pick<Character, "archetype" | "bio" | "backstory"> {
  return { archetype: "", bio: "", backstory: "" };
}

export function listCharactersForUser(userId: string): Character[] {
  return db
    .prepare(
      "SELECT * FROM characters WHERE user_id = ? ORDER BY created_at DESC, rowid DESC"
    )
    .all(userId) as Character[];
}

export function getCharacter(id: string): Character | null {
  const row = db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as
    | Character
    | undefined;
  return row ?? null;
}

function validateFields(fields: {
  name: string;
  archetype: string;
  bio: string;
  backstory: string;
}) {
  if (!fields.name) {
    throw new CharacterError("Name is required.");
  }
  if (fields.name.length > MAX_NAME) {
    throw new CharacterError(`Name can't be longer than ${MAX_NAME} characters.`);
  }
  if (fields.archetype.length > MAX_ARCHETYPE) {
    throw new CharacterError(
      `Class/ancestry/role can't be longer than ${MAX_ARCHETYPE} characters.`
    );
  }
  if (fields.bio.length > MAX_BIO) {
    throw new CharacterError(`Bio can't be longer than ${MAX_BIO} characters.`);
  }
  if (fields.backstory.length > MAX_BACKSTORY) {
    throw new CharacterError(
      `Backstory can't be longer than ${MAX_BACKSTORY} characters.`
    );
  }
}

export function createCharacter(
  userId: string,
  input: {
    name: string;
    archetype?: string;
    bio?: string;
    backstory?: string;
    avatarEmoji?: string;
  }
): Character {
  const defaults = defaultCharacterRow();
  const name = (input.name ?? "").trim();
  const archetype = (input.archetype ?? defaults.archetype).trim();
  const bio = (input.bio ?? defaults.bio).trim();
  const backstory = (input.backstory ?? defaults.backstory).trim();
  validateFields({ name, archetype, bio, backstory });

  const avatar_emoji =
    input.avatarEmoji !== undefined && isKnownAvatar(input.avatarEmoji)
      ? input.avatarEmoji
      : defaultAvatarFor(name);

  const now = new Date().toISOString();
  const character: Character = {
    id: uuidv4(),
    user_id: userId,
    name,
    archetype,
    bio,
    backstory,
    avatar_emoji,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO characters (id, user_id, name, archetype, bio, backstory, avatar_emoji, created_at, updated_at)
     VALUES (@id, @user_id, @name, @archetype, @bio, @backstory, @avatar_emoji, @created_at, @updated_at)`
  ).run(character);
  return character;
}

export function updateCharacter(
  characterId: string,
  userId: string,
  input: {
    name?: string;
    archetype?: string;
    bio?: string;
    backstory?: string;
    avatarEmoji?: string;
  }
): Character {
  const current = getCharacter(characterId);
  if (!current) throw new CharacterError("Character not found.");
  if (current.user_id !== userId) {
    throw new CharacterError("You can only edit your own characters.");
  }

  const name = (input.name ?? current.name).trim();
  const archetype = (input.archetype ?? current.archetype).trim();
  const bio = (input.bio ?? current.bio).trim();
  const backstory = (input.backstory ?? current.backstory).trim();
  validateFields({ name, archetype, bio, backstory });

  const avatar_emoji =
    input.avatarEmoji !== undefined
      ? isKnownAvatar(input.avatarEmoji)
        ? input.avatarEmoji
        : current.avatar_emoji
      : current.avatar_emoji;

  const updated_at = new Date().toISOString();
  db.prepare(
    `UPDATE characters
     SET name = ?, archetype = ?, bio = ?, backstory = ?, avatar_emoji = ?, updated_at = ?
     WHERE id = ?`
  ).run(name, archetype, bio, backstory, avatar_emoji, updated_at, characterId);

  return getCharacter(characterId) as Character;
}

export function deleteCharacter(characterId: string, userId: string): void {
  const current = getCharacter(characterId);
  if (!current) throw new CharacterError("Character not found.");
  if (current.user_id !== userId) {
    throw new CharacterError("You can only delete your own characters.");
  }
  db.prepare("DELETE FROM characters WHERE id = ?").run(characterId);
}
