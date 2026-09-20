import db from "./db";
import { rowToCampaign, type CampaignRow } from "./campaigns";
import {
  CAMPAIGN_SETTING_TAGS,
  CAMPAIGN_STRUCTURES,
  CAMPAIGN_TONE_TAGS,
  DANGER_LEVELS,
  GAMEPLAY_PILLARS,
  SESSION_FORMAT_PREFERENCES,
  type Campaign,
  type CampaignSettingTag,
  type CampaignStructure,
  type CampaignToneTag,
  type DangerLevel,
  type GameplayFocusRanking,
  type Profile,
  type SessionFormatPreference,
} from "./types";

export class ProfileError extends Error {}

const MAX_BIO = 2000;
const MAX_PREFERRED_SYSTEMS = 300;
const MAX_AVAILABILITY = 300;
const MAX_LOCATION = 200;
// Backlog #64 (owner-requested, live session): same "force a real choice"
// caps as lib/campaigns.ts's MAX_TONE_TAGS/MAX_SETTING_TAGS, applied to
// the player-preference side of the same vocabularies.
const MAX_TONE_TAGS = 5;
const MAX_SETTING_TAGS = 3;

function isKnownSessionFormatPreference(value: string): value is SessionFormatPreference {
  return (SESSION_FORMAT_PREFERENCES as readonly string[]).includes(value);
}

// Backlog #64: local copies of the same closed-vocabulary validators
// lib/campaigns.ts defines for the campaign side -- this app's own
// established convention is per-file validators over cross-file re-use
// (see e.g. isKnownDangerLevel/isKnownSessionFormat already being
// separately defined in lib/campaigns.ts despite the shared DANGER_LEVELS/
// SESSION_FORMATS constants).
function isKnownToneTag(value: string): value is CampaignToneTag {
  return (CAMPAIGN_TONE_TAGS as readonly string[]).includes(value);
}

function isKnownSettingTag(value: string): value is CampaignSettingTag {
  return (CAMPAIGN_SETTING_TAGS as readonly string[]).includes(value);
}

function isKnownStructure(value: string): value is CampaignStructure {
  return (CAMPAIGN_STRUCTURES as readonly string[]).includes(value);
}

function isKnownDangerLevel(value: string): value is DangerLevel {
  return (DANGER_LEVELS as readonly string[]).includes(value);
}

function validateToneTags(tags: string[]): void {
  if (tags.length > MAX_TONE_TAGS) {
    throw new ProfileError(`You can select at most ${MAX_TONE_TAGS} tone tags.`);
  }
  for (const tag of tags) {
    if (!isKnownToneTag(tag)) {
      throw new ProfileError(`"${tag}" isn't a valid tone tag.`);
    }
  }
}

function validateSettingTags(tags: string[]): void {
  if (tags.length > MAX_SETTING_TAGS) {
    throw new ProfileError(`You can select at most ${MAX_SETTING_TAGS} setting tags.`);
  }
  for (const tag of tags) {
    if (!isKnownSettingTag(tag)) {
      throw new ProfileError(`"${tag}" isn't a valid setting tag.`);
    }
  }
}

/** Backlog #64: a GameplayFocusRanking is either empty (unset) or a full
 * permutation of GAMEPLAY_PILLARS -- see lib/campaigns.ts's
 * validateGameplayFocus for the identical campaign-side rule. */
function validateGameplayFocus(ranking: string[]): void {
  if (ranking.length === 0) return;
  if (ranking.length !== GAMEPLAY_PILLARS.length) {
    throw new ProfileError(
      `Gameplay focus must rank all ${GAMEPLAY_PILLARS.length} pillars, or be left unset.`
    );
  }
  const seen = new Set<string>();
  for (const pillar of ranking) {
    if (!(GAMEPLAY_PILLARS as readonly string[]).includes(pillar)) {
      throw new ProfileError(`"${pillar}" isn't a valid gameplay-focus pillar.`);
    }
    if (seen.has(pillar)) {
      throw new ProfileError(`"${pillar}" can only appear once in a gameplay-focus ranking.`);
    }
    seen.add(pillar);
  }
}

function defaultProfile(userId: string): Profile {
  return {
    user_id: userId,
    bio: "",
    preferred_systems: "",
    availability: "",
    location: "",
    new_to_tabletop: 0,
    session_format_preference: null,
    tone_tags: [],
    setting_tags: [],
    gameplay_focus_preference: [],
    structure_preference: null,
    danger_level_preference: null,
    updated_at: null,
  };
}

/** Raw shape of a `profiles` row before its JSON-encoded array columns
 * are parsed -- mirrors lib/campaigns.ts's CampaignRow/rowToCampaign
 * convention for tone_tags/setting_tags/gameplay_focus. */
interface ProfileRow
  extends Omit<Profile, "tone_tags" | "setting_tags" | "gameplay_focus_preference"> {
  tone_tags: string;
  setting_tags: string;
  gameplay_focus_preference: string;
}

function parseJsonArrayColumn(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    ...row,
    tone_tags: parseJsonArrayColumn(row.tone_tags) as Profile["tone_tags"],
    setting_tags: parseJsonArrayColumn(row.setting_tags) as Profile["setting_tags"],
    gameplay_focus_preference: parseJsonArrayColumn(
      row.gameplay_focus_preference
    ) as GameplayFocusRanking,
  };
}

/** Every user has an implicit empty profile until they save one — mirrors
 * notification_preferences' "default until a row says otherwise" pattern. */
export function getProfile(userId: string): Profile {
  const row = db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(userId) as
    | ProfileRow
    | undefined;
  return row ? rowToProfile(row) : defaultProfile(userId);
}

export function upsertProfile(
  userId: string,
  input: {
    bio?: string;
    preferredSystems?: string;
    availability?: string;
    location?: string;
    /** undefined = leave unchanged, matching every other field here. */
    newToTabletop?: boolean;
    /** Backlog #41 phase 1: the player-side symmetric preference to a
     * campaign's session_format -- undefined = leave unchanged, null =
     * clear back to "no preference stated", a recognized value = set it.
     * Purely informational for this phase (see the field's own doc
     * comment on the Profile type) -- not wired into any ranking. */
    sessionFormatPreference?: SessionFormatPreference | null;
    /** Backlog #64: undefined = leave unchanged. A provided array always
     * replaces the whole list, same full-replace convention as a
     * campaign's own toneTags update. */
    toneTags?: string[];
    settingTags?: string[];
    /** Backlog #64: undefined = leave unchanged; either the empty array
     * or a full ranking, validated by validateGameplayFocus. */
    gameplayFocusPreference?: string[];
    /** undefined = leave unchanged; null = clear; a CampaignStructure =
     * set it -- same three-state convention as sessionFormatPreference
     * above. */
    structurePreference?: CampaignStructure | null;
    dangerLevelPreference?: DangerLevel | null;
  }
): Profile {
  const current = getProfile(userId);
  const bio = (input.bio ?? current.bio).trim();
  const preferredSystems = (input.preferredSystems ?? current.preferred_systems).trim();
  const availability = (input.availability ?? current.availability).trim();
  const location = (input.location ?? current.location).trim();
  const newToTabletop =
    input.newToTabletop !== undefined ? (input.newToTabletop ? 1 : 0) : current.new_to_tabletop;
  const sessionFormatPreference =
    input.sessionFormatPreference !== undefined
      ? input.sessionFormatPreference
      : current.session_format_preference;

  if (
    sessionFormatPreference !== null &&
    sessionFormatPreference !== undefined &&
    !isKnownSessionFormatPreference(sessionFormatPreference)
  ) {
    throw new ProfileError("Not a recognized session format preference.");
  }

  if (input.toneTags !== undefined) {
    validateToneTags(input.toneTags);
  }
  if (input.settingTags !== undefined) {
    validateSettingTags(input.settingTags);
  }
  if (input.gameplayFocusPreference !== undefined) {
    validateGameplayFocus(input.gameplayFocusPreference);
  }
  if (
    input.structurePreference !== undefined &&
    input.structurePreference !== null &&
    !isKnownStructure(input.structurePreference)
  ) {
    throw new ProfileError("Not a recognized campaign structure.");
  }
  if (
    input.dangerLevelPreference !== undefined &&
    input.dangerLevelPreference !== null &&
    !isKnownDangerLevel(input.dangerLevelPreference)
  ) {
    throw new ProfileError("Not a recognized danger level.");
  }
  const toneTags = (input.toneTags ?? current.tone_tags) as CampaignToneTag[];
  const settingTags = (input.settingTags ?? current.setting_tags) as CampaignSettingTag[];
  const gameplayFocusPreference = (input.gameplayFocusPreference ??
    current.gameplay_focus_preference) as GameplayFocusRanking;
  const structurePreference =
    input.structurePreference !== undefined
      ? input.structurePreference
      : current.structure_preference;
  const dangerLevelPreference =
    input.dangerLevelPreference !== undefined
      ? input.dangerLevelPreference
      : current.danger_level_preference;

  if (bio.length > MAX_BIO) {
    throw new ProfileError(`Bio can't be longer than ${MAX_BIO} characters.`);
  }
  if (preferredSystems.length > MAX_PREFERRED_SYSTEMS) {
    throw new ProfileError(
      `Preferred systems can't be longer than ${MAX_PREFERRED_SYSTEMS} characters.`
    );
  }
  if (availability.length > MAX_AVAILABILITY) {
    throw new ProfileError(
      `Availability can't be longer than ${MAX_AVAILABILITY} characters.`
    );
  }
  if (location.length > MAX_LOCATION) {
    throw new ProfileError(`Location can't be longer than ${MAX_LOCATION} characters.`);
  }

  const updated_at = new Date().toISOString();
  db.prepare(
    `INSERT INTO profiles (user_id, bio, preferred_systems, availability, location, new_to_tabletop, session_format_preference, tone_tags, setting_tags, gameplay_focus_preference, structure_preference, danger_level_preference, updated_at)
     VALUES (@user_id, @bio, @preferred_systems, @availability, @location, @new_to_tabletop, @session_format_preference, @tone_tags, @setting_tags, @gameplay_focus_preference, @structure_preference, @danger_level_preference, @updated_at)
     ON CONFLICT (user_id) DO UPDATE SET
       bio = excluded.bio,
       preferred_systems = excluded.preferred_systems,
       availability = excluded.availability,
       location = excluded.location,
       new_to_tabletop = excluded.new_to_tabletop,
       session_format_preference = excluded.session_format_preference,
       tone_tags = excluded.tone_tags,
       setting_tags = excluded.setting_tags,
       gameplay_focus_preference = excluded.gameplay_focus_preference,
       structure_preference = excluded.structure_preference,
       danger_level_preference = excluded.danger_level_preference,
       updated_at = excluded.updated_at`
  ).run({
    user_id: userId,
    bio,
    preferred_systems: preferredSystems,
    availability,
    location,
    new_to_tabletop: newToTabletop,
    session_format_preference: sessionFormatPreference,
    tone_tags: JSON.stringify(toneTags),
    setting_tags: JSON.stringify(settingTags),
    gameplay_focus_preference: JSON.stringify(gameplayFocusPreference),
    structure_preference: structurePreference,
    danger_level_preference: dangerLevelPreference,
    updated_at,
  });
  return getProfile(userId);
}

/** Splits the stored comma-separated preferred-systems string into a clean
 * list of individual system names for display (chips, etc). */
export function splitPreferredSystems(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface MyCampaigns {
  dming: Campaign[];
  playing: Campaign[];
}

/** Campaigns a user is DMing, and campaigns they're an active (approved)
 * player in — the data behind the "My campaigns" view on the profile page. */
export function myCampaigns(userId: string): MyCampaigns {
  const dming = (
    db
      .prepare(
        "SELECT * FROM campaigns WHERE dm_id = ? ORDER BY created_at DESC, rowid DESC"
      )
      .all(userId) as CampaignRow[]
  ).map(rowToCampaign);

  const playing = (
    db
      .prepare(
        `SELECT campaigns.* FROM campaigns
         JOIN memberships ON memberships.campaign_id = campaigns.id
         WHERE memberships.user_id = ? AND memberships.status = 'approved'
         ORDER BY memberships.updated_at DESC, memberships.rowid DESC`
      )
      .all(userId) as CampaignRow[]
  ).map(rowToCampaign);

  return { dming, playing };
}
