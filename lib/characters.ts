import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getCampaign } from "./campaigns";
import { hasPrivateAccess } from "./access";
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

/** A character always belongs to a user (its owner), and is always visible
 * on that user's public /players/[id] page regardless of campaign — that's
 * the account-level "who is this person" identity. A character can
 * *additionally* be linked to one campaign (campaign_id, nullable), which
 * also surfaces it on that campaign's page alongside the roster — for a
 * player who wants to say "this is the character I'm bringing to this
 * table." Linking requires the same DM-or-approved-member check as party
 * notes/session log (hasPrivateAccess), so a character can't be attached to
 * a campaign its owner isn't actually part of. Unlinking (setting
 * campaign_id back to null) never needs that check — removing a claim
 * can't spoof anything the way adding one could. */
function assertCampaignLinkAllowed(campaignId: string, userId: string): void {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new CharacterError("Campaign not found.");
  if (!hasPrivateAccess(userId, campaignId)) {
    throw new CharacterError(
      "You can only link a character to a campaign you're the DM of or an active member of."
    );
  }
}

export function listCharactersForUser(userId: string): Character[] {
  return db
    .prepare(
      "SELECT * FROM characters WHERE user_id = ? ORDER BY created_at DESC, rowid DESC"
    )
    .all(userId) as Character[];
}

/** Characters linked to a campaign, oldest first — shown alongside the
 * roster on the campaign detail page. Public in the same way the roster
 * is: no access check here, matching this app's existing DM/player-name
 * visibility (and every character here is already fully public via its
 * owner's /players/[id] page regardless). */
export function listCharactersForCampaign(campaignId: string): Character[] {
  return db
    .prepare(
      "SELECT * FROM characters WHERE campaign_id = ? ORDER BY created_at ASC, rowid ASC"
    )
    .all(campaignId) as Character[];
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

export interface CharacterCreateInput {
  name: string;
  archetype?: string;
  bio?: string;
  backstory?: string;
  avatarEmoji?: string;
  /** Optional campaign to link this character to on creation. Must be a
   * campaign the creating user has DM/active-member access to. */
  campaignId?: string | null;
}

export function createCharacter(userId: string, input: CharacterCreateInput): Character {
  const name = (input.name ?? "").trim();
  const archetype = (input.archetype ?? "").trim();
  const bio = (input.bio ?? "").trim();
  const backstory = (input.backstory ?? "").trim();
  validateFields({ name, archetype, bio, backstory });

  const avatar_emoji =
    input.avatarEmoji !== undefined && isKnownAvatar(input.avatarEmoji)
      ? input.avatarEmoji
      : defaultAvatarFor(name);

  const campaignId = input.campaignId ?? null;
  if (campaignId) assertCampaignLinkAllowed(campaignId, userId);

  const now = new Date().toISOString();
  const character: Character = {
    id: uuidv4(),
    user_id: userId,
    campaign_id: campaignId,
    name,
    archetype,
    bio,
    backstory,
    avatar_emoji,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO characters (id, user_id, campaign_id, name, archetype, bio, backstory, avatar_emoji, created_at, updated_at)
     VALUES (@id, @user_id, @campaign_id, @name, @archetype, @bio, @backstory, @avatar_emoji, @created_at, @updated_at)`
  ).run(character);
  return character;
}

export interface CharacterUpdateInput {
  name?: string;
  archetype?: string;
  bio?: string;
  backstory?: string;
  avatarEmoji?: string;
  /** undefined = leave the campaign link unchanged; null = unlink;
   * a campaign id = link/re-link (access-checked). */
  campaignId?: string | null;
}

export function updateCharacter(
  characterId: string,
  userId: string,
  input: CharacterUpdateInput
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

  let campaign_id = current.campaign_id;
  if (input.campaignId !== undefined) {
    if (input.campaignId === null) {
      campaign_id = null;
    } else {
      assertCampaignLinkAllowed(input.campaignId, userId);
      campaign_id = input.campaignId;
    }
  }

  const updated_at = new Date().toISOString();
  db.prepare(
    `UPDATE characters
     SET name = ?, archetype = ?, bio = ?, backstory = ?, avatar_emoji = ?, campaign_id = ?, updated_at = ?
     WHERE id = ?`
  ).run(name, archetype, bio, backstory, avatar_emoji, campaign_id, updated_at, characterId);

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
