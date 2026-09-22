import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { notify } from "./notifications";
import {
  CAMPAIGN_SETTING_TAGS,
  CAMPAIGN_STRUCTURES,
  CAMPAIGN_TONE_TAGS,
  DANGER_LEVELS,
  GAMEPLAY_PILLARS,
  SESSION_FORMATS,
  type Campaign,
  type CampaignSettingTag,
  type CampaignStructure,
  type CampaignToneTag,
  type DangerLevel,
  type GameplayFocusRanking,
  type SessionFormat,
} from "./types";

export class CampaignError extends Error {}

export { CAMPAIGN_TONE_TAGS };

// Backlog #29's sub_requests.location precedent for a short, coarse
// free-text field; starting level is even shorter in practice ("Level 3",
// "Tier 2", "Session 0"), but the cap is generous rather than exact.
const MAX_STARTING_LEVEL = 100;
// Matches the cap other curated tag lists in this app use (e.g.
// CAMPAIGN_RATING_TAGS' MAX_TAGS) -- here it's meaningfully below the full
// CAMPAIGN_TONE_TAGS vocabulary (8), forcing a DM to pick the tags that
// actually describe the table rather than checking every box.
const MAX_TONE_TAGS = 5;
// Backlog #64: same "force a real choice, don't just check every box"
// reasoning as MAX_TONE_TAGS above, scaled to the smaller 6-tag
// CAMPAIGN_SETTING_TAGS vocabulary.
const MAX_SETTING_TAGS = 3;

function isKnownDangerLevel(value: string): value is DangerLevel {
  return (DANGER_LEVELS as readonly string[]).includes(value);
}

function isKnownSessionFormat(value: string): value is SessionFormat {
  return (SESSION_FORMATS as readonly string[]).includes(value);
}

function isKnownToneTag(value: string): value is CampaignToneTag {
  return (CAMPAIGN_TONE_TAGS as readonly string[]).includes(value);
}

/** Validates a tone-tag list against the closed CAMPAIGN_TONE_TAGS
 * vocabulary and the MAX_TONE_TAGS cap -- the exact validation shape
 * lib/campaignRatings.ts's rateCampaign uses for CAMPAIGN_RATING_TAGS.
 * Throws CampaignError on the first problem found. */
function validateToneTags(tags: string[]): void {
  if (tags.length > MAX_TONE_TAGS) {
    throw new CampaignError(`You can select at most ${MAX_TONE_TAGS} tone tags.`);
  }
  for (const tag of tags) {
    if (!isKnownToneTag(tag)) {
      throw new CampaignError(`"${tag}" isn't a valid campaign tone tag.`);
    }
  }
}

function isKnownSettingTag(value: string): value is CampaignSettingTag {
  return (CAMPAIGN_SETTING_TAGS as readonly string[]).includes(value);
}

/** Backlog #64: same validation shape as validateToneTags above, against
 * the separate CAMPAIGN_SETTING_TAGS vocabulary and its own, tighter cap
 * (MAX_SETTING_TAGS) -- a full 6-tag vocabulary makes a lower cap more
 * meaningful than tone's 5-of-8. */
function validateSettingTags(tags: string[]): void {
  if (tags.length > MAX_SETTING_TAGS) {
    throw new CampaignError(`You can select at most ${MAX_SETTING_TAGS} setting tags.`);
  }
  for (const tag of tags) {
    if (!isKnownSettingTag(tag)) {
      throw new CampaignError(`"${tag}" isn't a valid campaign setting tag.`);
    }
  }
}

function isKnownStructure(value: string): value is CampaignStructure {
  return (CAMPAIGN_STRUCTURES as readonly string[]).includes(value);
}

/** Backlog #64: a GameplayFocusRanking is either empty (unset) or a full
 * permutation of GAMEPLAY_PILLARS -- no partial rankings, and no
 * duplicate/unrecognized pillars. Throws CampaignError on the first
 * problem found, same convention as the tag validators above. */
function validateGameplayFocus(ranking: string[]): void {
  if (ranking.length === 0) return;
  if (ranking.length !== GAMEPLAY_PILLARS.length) {
    throw new CampaignError(
      `Gameplay focus must rank all ${GAMEPLAY_PILLARS.length} pillars, or be left unset.`
    );
  }
  const seen = new Set<string>();
  for (const pillar of ranking) {
    if (!(GAMEPLAY_PILLARS as readonly string[]).includes(pillar)) {
      throw new CampaignError(`"${pillar}" isn't a valid gameplay-focus pillar.`);
    }
    if (seen.has(pillar)) {
      throw new CampaignError(`"${pillar}" can only appear once in a gameplay-focus ranking.`);
    }
    seen.add(pillar);
  }
}

// Exported so any other module reading raw `campaigns` rows directly
// (rather than going through this file's own getCampaign/listCampaigns)
// can parse tone_tags the same way -- see lib/profiles.ts's myCampaigns.
export interface CampaignRow
  extends Omit<Campaign, "tone_tags" | "setting_tags" | "gameplay_focus"> {
  tone_tags: string;
  setting_tags: string;
  gameplay_focus: string;
}

/** Parses a JSON-encoded array column, falling back to an empty array on
 * malformed JSON or a non-array value -- the shared implementation behind
 * rowToCampaign's tone_tags/setting_tags/gameplay_focus parsing below. */
function parseJsonArrayColumn(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Parses the JSON-encoded tone_tags/setting_tags/gameplay_focus columns
 * into real arrays -- the same parse-on-read convention already
 * established for ratings.tags/campaign_ratings.tags (see
 * lib/ratings.ts/lib/campaignRatings.ts's own rowToRating). Every raw
 * `SELECT * FROM campaigns` read in this file goes through this so a
 * caller never sees a raw JSON string. */
export function rowToCampaign(row: CampaignRow): Campaign {
  return {
    ...row,
    tone_tags: parseJsonArrayColumn(row.tone_tags) as CampaignToneTag[],
    setting_tags: parseJsonArrayColumn(row.setting_tags) as CampaignSettingTag[],
    gameplay_focus: parseJsonArrayColumn(row.gameplay_focus) as GameplayFocusRanking,
  };
}

export function approvedHeadcount(campaignId: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM memberships WHERE campaign_id = ? AND status = 'approved'"
    )
    .get(campaignId) as { count: number };
  return row.count;
}

export function createCampaign(input: {
  dmId: string;
  title: string;
  description: string;
  system: string;
  capacity: number;
  location?: string;
  /** Backlog #40: DM self-flags this table as welcoming to someone new
   * to tabletop gaming, following the exact danger_level convention
   * (a heads-up filter field, not a scoreboard). Defaults to false. */
  newPlayerFriendly?: boolean;
  /** Backlog #41 phase 1: structural in-person/remote/hybrid flag -- see
   * SESSION_FORMATS' doc comment in lib/types.ts. Defaults to null
   * (unset), same as danger_level. */
  sessionFormat?: SessionFormat;
  /** Backlog #30: free-text starting level/rank -- see Campaign.
   * starting_level's doc comment in lib/types.ts. Defaults to null
   * (unset), same as danger_level/location. */
  startingLevel?: string;
  /** Backlog #30: curated multi-select tone/style tags -- see
   * Campaign.tone_tags' doc comment in lib/types.ts. Defaults to an
   * empty array. */
  toneTags?: string[];
  /** Backlog #64: curated multi-select setting/environment tags -- see
   * Campaign.setting_tags' doc comment in lib/types.ts. Defaults to an
   * empty array. */
  settingTags?: string[];
  /** Backlog #64: ranked pillars-of-play emphasis -- see
   * Campaign.gameplay_focus' doc comment in lib/types.ts. Defaults to an
   * empty array (unranked). */
  gameplayFocus?: string[];
  /** Backlog #64: how the narrative unfolds -- see Campaign.structure's
   * doc comment in lib/types.ts. Defaults to null (unset), settable at
   * creation time like sessionFormat above (unlike dangerLevel, which is
   * only settable via updateCampaign after creation). */
  structure?: CampaignStructure;
  /** Backlog #67: set only by duplicateCampaign, to the ultimate original
   * campaign's id -- see Campaign.duplicated_from_id's doc comment in
   * lib/types.ts. Not exposed on /campaigns/new; every other caller of
   * createCampaign leaves this undefined, defaulting to null. */
  duplicatedFromId?: string;
}): Campaign {
  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    throw new CampaignError("Capacity must be a positive integer.");
  }
  if (input.sessionFormat !== undefined && !isKnownSessionFormat(input.sessionFormat)) {
    throw new CampaignError("Not a recognized session format.");
  }
  if (input.structure !== undefined && !isKnownStructure(input.structure)) {
    throw new CampaignError("Not a recognized campaign structure.");
  }
  const trimmedStartingLevel = (input.startingLevel ?? "").trim();
  if (trimmedStartingLevel.length > MAX_STARTING_LEVEL) {
    throw new CampaignError(`Starting level can't be longer than ${MAX_STARTING_LEVEL} characters.`);
  }
  const toneTags = input.toneTags ?? [];
  validateToneTags(toneTags);
  const settingTags = input.settingTags ?? [];
  validateSettingTags(settingTags);
  const gameplayFocus = input.gameplayFocus ?? [];
  validateGameplayFocus(gameplayFocus);
  const now = new Date().toISOString();
  const campaign: Campaign = {
    id: uuidv4(),
    dm_id: input.dmId,
    title: input.title.trim(),
    description: input.description.trim(),
    system: input.system.trim(),
    capacity: input.capacity,
    accepting_requests: 1,
    cancelled: 0,
    next_session_at: null,
    danger_level: null,
    location: (input.location ?? "").trim(),
    new_player_friendly: input.newPlayerFriendly ? 1 : 0,
    session_format: input.sessionFormat ?? null,
    starting_level: trimmedStartingLevel || null,
    tone_tags: toneTags as CampaignToneTag[],
    setting_tags: settingTags as CampaignSettingTag[],
    gameplay_focus: gameplayFocus as GameplayFocusRanking,
    structure: input.structure ?? null,
    duplicated_from_id: input.duplicatedFromId ?? null,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO campaigns
      (id, dm_id, title, description, system, capacity, accepting_requests, cancelled, next_session_at, danger_level, location, new_player_friendly, session_format, starting_level, tone_tags, setting_tags, gameplay_focus, structure, duplicated_from_id, created_at, updated_at)
     VALUES
      (@id, @dm_id, @title, @description, @system, @capacity, @accepting_requests, @cancelled, @next_session_at, @danger_level, @location, @new_player_friendly, @session_format, @starting_level, @tone_tags, @setting_tags, @gameplay_focus, @structure, @duplicated_from_id, @created_at, @updated_at)`
  ).run({
    ...campaign,
    tone_tags: JSON.stringify(toneTags),
    setting_tags: JSON.stringify(settingTags),
    gameplay_focus: JSON.stringify(gameplayFocus),
  });
  return campaign;
}

export function getCampaign(id: string): Campaign | null {
  const row = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as
    | CampaignRow
    | undefined;
  return row ? rowToCampaign(row) : null;
}

export function updateCampaign(
  id: string,
  dmId: string,
  updates: Partial<{
    title: string;
    description: string;
    system: string;
    capacity: number;
    /** undefined = leave unchanged; null = clear; a DangerLevel = set it.
     * DM-set, player-visible heads-up filter — see the field's own doc
     * comment on the Campaign type for the "not a scoreboard" framing. */
    dangerLevel: DangerLevel | null;
    location: string;
    /** undefined = leave unchanged, matching every other field here. */
    newPlayerFriendly: boolean;
    /** undefined = leave unchanged; null = clear; a SessionFormat = set
     * it -- same three-state convention as dangerLevel above. */
    sessionFormat: SessionFormat | null;
    /** undefined = leave unchanged; null/empty-string = clear; free text =
     * set it -- same three-state convention as dangerLevel/sessionFormat
     * above, just with free text instead of an enum. */
    startingLevel: string | null;
    /** undefined = leave unchanged, matching every other field here. A
     * provided array always replaces the whole tag list (no partial
     * add/remove), the same full-replace convention rateCampaign/
     * rateCampaignParticipant already use for their own tags. */
    toneTags: string[];
    /** Backlog #64: same full-replace convention as toneTags above. */
    settingTags: string[];
    /** Backlog #64: same full-replace convention as toneTags above --
     * either the empty array or a full ranking, validated by
     * validateGameplayFocus. */
    gameplayFocus: string[];
    /** undefined = leave unchanged; null = clear; a CampaignStructure =
     * set it -- same three-state convention as dangerLevel/sessionFormat
     * above. */
    structure: CampaignStructure | null;
  }>
): Campaign {
  const campaign = getCampaign(id);
  if (!campaign) throw new CampaignError("Campaign not found.");
  if (campaign.dm_id !== dmId) {
    throw new CampaignError("Only the DM can edit this campaign.");
  }
  if (updates.capacity !== undefined) {
    if (!Number.isInteger(updates.capacity) || updates.capacity < 1) {
      throw new CampaignError("Capacity must be a positive integer.");
    }
    const current = approvedHeadcount(id);
    if (updates.capacity < current) {
      throw new CampaignError(
        `Capacity can't be dropped below the current approved headcount (${current}).`
      );
    }
  }
  if (updates.dangerLevel !== undefined && updates.dangerLevel !== null && !isKnownDangerLevel(updates.dangerLevel)) {
    throw new CampaignError("Not a recognized danger level.");
  }
  if (
    updates.sessionFormat !== undefined &&
    updates.sessionFormat !== null &&
    !isKnownSessionFormat(updates.sessionFormat)
  ) {
    throw new CampaignError("Not a recognized session format.");
  }
  let nextStartingLevel = campaign.starting_level;
  if (updates.startingLevel !== undefined) {
    const trimmed = (updates.startingLevel ?? "").trim();
    if (trimmed.length > MAX_STARTING_LEVEL) {
      throw new CampaignError(`Starting level can't be longer than ${MAX_STARTING_LEVEL} characters.`);
    }
    nextStartingLevel = trimmed || null;
  }
  if (updates.toneTags !== undefined) {
    validateToneTags(updates.toneTags);
  }
  if (updates.settingTags !== undefined) {
    validateSettingTags(updates.settingTags);
  }
  if (updates.gameplayFocus !== undefined) {
    validateGameplayFocus(updates.gameplayFocus);
  }
  if (
    updates.structure !== undefined &&
    updates.structure !== null &&
    !isKnownStructure(updates.structure)
  ) {
    throw new CampaignError("Not a recognized campaign structure.");
  }
  const nextToneTags = (updates.toneTags ?? campaign.tone_tags) as CampaignToneTag[];
  const nextSettingTags = (updates.settingTags ?? campaign.setting_tags) as CampaignSettingTag[];
  const nextGameplayFocus = (updates.gameplayFocus ?? campaign.gameplay_focus) as GameplayFocusRanking;
  const next: Campaign = {
    ...campaign,
    title: updates.title !== undefined ? updates.title.trim() : campaign.title,
    description:
      updates.description !== undefined
        ? updates.description.trim()
        : campaign.description,
    system: updates.system !== undefined ? updates.system.trim() : campaign.system,
    capacity: updates.capacity ?? campaign.capacity,
    danger_level: updates.dangerLevel !== undefined ? updates.dangerLevel : campaign.danger_level,
    location: updates.location !== undefined ? updates.location.trim() : campaign.location,
    new_player_friendly:
      updates.newPlayerFriendly !== undefined
        ? (updates.newPlayerFriendly ? 1 : 0)
        : campaign.new_player_friendly,
    session_format:
      updates.sessionFormat !== undefined ? updates.sessionFormat : campaign.session_format,
    starting_level: nextStartingLevel,
    tone_tags: nextToneTags,
    setting_tags: nextSettingTags,
    gameplay_focus: nextGameplayFocus,
    structure: updates.structure !== undefined ? updates.structure : campaign.structure,
    updated_at: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE campaigns SET title=@title, description=@description, system=@system,
     capacity=@capacity, danger_level=@danger_level, location=@location,
     new_player_friendly=@new_player_friendly, session_format=@session_format,
     starting_level=@starting_level, tone_tags=@tone_tags,
     setting_tags=@setting_tags, gameplay_focus=@gameplay_focus, structure=@structure,
     updated_at=@updated_at WHERE id=@id`
  ).run({
    ...next,
    tone_tags: JSON.stringify(nextToneTags),
    setting_tags: JSON.stringify(nextSettingTags),
    gameplay_focus: JSON.stringify(nextGameplayFocus),
  });
  return next;
}

/** Backlog #47 (self-identified): a DM who runs recurring one-shots or
 * west-marches-style tables currently has to re-type every field from
 * scratch for each new table. Duplicates a campaign's own re-usable
 * "setup" fields (title, description, system, capacity, location,
 * new-player-friendly flag, session format, starting level, tone tags,
 * and danger level) into a brand-new campaign owned by the same DM --
 * deliberately NOT the roster, schedule, session log, party notes,
 * table chat, resources, initiative tracker, NPC notes, sub requests, or
 * ratings, all of which belong to one specific run of the table, not the
 * template it was built from. The new campaign starts exactly like any
 * other freshly-created one: open for requests, an empty roster, and no
 * next session scheduled -- a DM re-launches the duplicate the same way
 * they'd launch any new campaign (posting a fresh schedule once players
 * have joined). Only the original campaign's own DM may duplicate it. */
export function duplicateCampaign(id: string, dmId: string): Campaign {
  const source = getCampaign(id);
  if (!source) throw new CampaignError("Campaign not found.");
  if (source.dm_id !== dmId) {
    throw new CampaignError("Only the DM can duplicate this campaign.");
  }
  const copy = createCampaign({
    dmId,
    title: `${source.title} (Copy)`,
    description: source.description,
    system: source.system,
    capacity: source.capacity,
    location: source.location,
    newPlayerFriendly: !!source.new_player_friendly,
    sessionFormat: source.session_format ?? undefined,
    startingLevel: source.starting_level ?? undefined,
    toneTags: source.tone_tags,
    settingTags: source.setting_tags,
    gameplayFocus: source.gameplay_focus,
    structure: source.structure ?? undefined,
    // Backlog #67: flat lineage, not a parent-chain -- a duplicate of a
    // duplicate still points at the ultimate original (source's own
    // duplicated_from_id if it has one, otherwise source itself), so
    // listRelatedCampaigns can find every campaign in the lineage with
    // one query no matter how many times it's been re-duplicated.
    duplicatedFromId: source.duplicated_from_id ?? source.id,
  });
  // createCampaign has no dangerLevel parameter -- it's only settable
  // after creation via updateCampaign, matching this app's own existing
  // /campaigns/new form, which likewise has no danger-level field at
  // creation time. A follow-up update carries it over so a duplicate
  // doesn't silently drop a DM-set heads-up filter the original had.
  if (source.danger_level) {
    return updateCampaign(copy.id, dmId, { dangerLevel: source.danger_level });
  }
  return copy;
}

/** Backlog #67 (competitive research vs. StartPlaying.games): a duplicated
 * campaign (backlog #47) had no recorded link back to its original --
 * this surfaces "Other tables by this DM" cross-links on the campaign
 * detail page. Returns every other campaign in the same duplication
 * lineage as `id` (the ultimate original, plus every sibling duplicated
 * from it), oldest first, excluding `id` itself. Returns an empty array
 * for a campaign with no duplication history at all (never duplicated,
 * and never itself a duplicate) -- the common case, so callers should
 * only render a "Related sections" block when this is non-empty. No
 * separate dm_id filter is needed: duplicateCampaign only ever succeeds
 * when the caller already owns the original (`source.dm_id !== dmId`
 * throws), so every campaign in a lineage group necessarily shares one
 * dm_id already. */
export function listRelatedCampaigns(id: string): Campaign[] {
  const self = getCampaign(id);
  if (!self) return [];
  const originalId = self.duplicated_from_id ?? self.id;
  const rows = db
    .prepare(
      `SELECT * FROM campaigns
       WHERE id != @selfId AND (id = @originalId OR duplicated_from_id = @originalId)
       ORDER BY created_at ASC, rowid ASC`
    )
    .all({ selfId: id, originalId }) as CampaignRow[];
  return rows.map(rowToCampaign);
}

export function setCancelled(
  id: string,
  dmId: string,
  cancelled: boolean
): Campaign {
  const campaign = getCampaign(id);
  if (!campaign) throw new CampaignError("Campaign not found.");
  if (campaign.dm_id !== dmId) {
    throw new CampaignError("Only the DM can cancel this campaign.");
  }
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE campaigns SET cancelled = ?, updated_at = ? WHERE id = ?"
  ).run(cancelled ? 1 : 0, now, id);

  if (cancelled) {
    const activeMembers = db
      .prepare(
        "SELECT user_id FROM memberships WHERE campaign_id = ? AND status = 'approved'"
      )
      .all(id) as { user_id: string }[];
    for (const m of activeMembers) {
      notify(
        m.user_id,
        "campaign_cancelled",
        id,
        `"${campaign.title}" has been cancelled.`
      );
    }
  }
  return getCampaign(id) as Campaign;
}

export function manualReopen(id: string, dmId: string): Campaign {
  const campaign = getCampaign(id);
  if (!campaign) throw new CampaignError("Campaign not found.");
  if (campaign.dm_id !== dmId) {
    throw new CampaignError("Only the DM can reopen this campaign.");
  }
  db.prepare(
    "UPDATE campaigns SET accepting_requests = 1, updated_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), id);
  return getCampaign(id) as Campaign;
}

export type CampaignSort = "newest" | "oldest" | "title";

// Exported (not just used internally) so lib/systems.ts's curated
// system-hub matching (backlog #36) can build its own OR'd LIKE clauses
// against `system` the same escaped way, instead of re-implementing this.
export function escapeLikePattern(value: string): string {
  // Escape LIKE wildcards (% and _) and the escape character itself so a
  // keyword search treats them as literal characters, not SQL wildcards.
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function listCampaigns(opts: {
  system?: string;
  q?: string;
  /** Coarse, case-insensitive substring match against the campaign's
   * free-text location (e.g. filtering "Austin" matches "Austin, TX") —
   * a lighter-weight first step toward "near me" discovery. Not a
   * geocoded distance search; see the location field's own doc comment. */
  location?: string;
  /** Backlog #36 (curated system hubs): OR'd case-insensitive substring
   * match against `system`, one clause per pattern, ANDed with every
   * other filter the same way `system`/`q`/`location` already are. Never
   * populated from raw user input directly -- lib/systems.ts builds this
   * from a curated system's own name + aliases -- but escaped via
   * escapeLikePattern the same defensive way regardless. */
  systemAliases?: string[];
  /** Backlog #40: when true, only campaigns the DM has flagged
   * new-player-friendly. Undefined/false means no filtering by this
   * field at all (not "only non-friendly campaigns") -- same
   * opt-in-only shape as every other filter here. */
  newPlayerFriendly?: boolean;
  /** Backlog #41 phase 1: exact-match filter on the structural
   * in-person/remote/hybrid field -- lets a viewer deliberately search
   * for (e.g.) only remote games, same opt-in-only shape as
   * newPlayerFriendly above. Independent of, and not to be confused
   * with, the default in-person-favoring *ranking* below (which never
   * excludes anything -- this filter is the only thing here that does). */
  sessionFormat?: SessionFormat;
  /** Backlog #30: any-of match against the curated, multi-select
   * tone_tags list -- a campaign matches if it carries at least one of
   * the given tags, not all of them (a viewer picking "horror" and
   * "comedic" wants either kind of table, not one that's somehow both).
   * Unrecognized tags are simply ignored rather than erroring the whole
   * browse page -- see parseSessionFormat's precedent in
   * app/api/campaigns/route.ts for the same "invalid filter value is
   * silently dropped, not a 400" shape applied to a GET/browse filter. */
  toneTags?: string[];
  sort?: CampaignSort;
  page?: number;
  pageSize?: number;
  includeCancelled?: boolean;
} = {}): { items: Campaign[]; total: number } {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 10;
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.system) {
    where.push("system = @system");
    params.system = opts.system;
  }
  const keyword = opts.q?.trim();
  if (keyword) {
    where.push(
      "(LOWER(title) LIKE @q ESCAPE '\\' OR LOWER(description) LIKE @q ESCAPE '\\' OR LOWER(system) LIKE @q ESCAPE '\\')"
    );
    params.q = `%${escapeLikePattern(keyword.toLowerCase())}%`;
  }
  const location = opts.location?.trim();
  if (location) {
    where.push("LOWER(location) LIKE @location ESCAPE '\\'");
    params.location = `%${escapeLikePattern(location.toLowerCase())}%`;
  }
  const systemAliases = (opts.systemAliases ?? [])
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);
  if (systemAliases.length > 0) {
    const clauses = systemAliases.map((alias, i) => {
      const key = `sysAlias${i}`;
      params[key] = `%${escapeLikePattern(alias.toLowerCase())}%`;
      return `LOWER(system) LIKE @${key} ESCAPE '\\'`;
    });
    where.push(`(${clauses.join(" OR ")})`);
  }
  if (opts.newPlayerFriendly) {
    where.push("new_player_friendly = 1");
  }
  if (opts.sessionFormat) {
    where.push("session_format = @sessionFormat");
    params.sessionFormat = opts.sessionFormat;
  }
  // Backlog #30: tone_tags is a JSON-encoded array (e.g. '["horror",
  // "comedic"]'), so an any-of match is a substring LIKE against each
  // selected tag's quoted form, OR'd together -- no json_each dependency
  // needed, and safe against false-substring-matches because every match
  // is anchored by the JSON string's own quote characters and the curated
  // vocabulary has no tag that's a substring of another. Only recognized
  // tags reach this filter (see listCampaigns' toneTags doc comment above).
  const toneTags = (opts.toneTags ?? []).filter(isKnownToneTag);
  if (toneTags.length > 0) {
    const clauses = toneTags.map((tag, i) => {
      const key = `toneTag${i}`;
      params[key] = `%"${escapeLikePattern(tag)}"%`;
      return `tone_tags LIKE @${key} ESCAPE '\\'`;
    });
    where.push(`(${clauses.join(" OR ")})`);
  }
  if (!opts.includeCancelled) {
    where.push("cancelled = 0");
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const secondaryOrderBy =
    opts.sort === "oldest"
      ? "created_at ASC, rowid ASC"
      : opts.sort === "title"
        ? "title ASC, rowid ASC"
        : "created_at DESC, rowid DESC";
  // Backlog #41 phase 1: in-person-first discovery ranking, per the
  // owner's explicit in-person-first product direction (see the dated
  // 2026-09-07 entry in progress.md). A stable sort, not a filter -- this
  // ranks in-person campaigns ahead of remote/unset ones *within*
  // whatever secondary order the caller already asked for (newest/
  // oldest/title), so a remote campaign is never excluded, only ranked
  // after in-person ones of the same tier. Hybrid tables land in
  // between. A campaign with no session_format set (null -- the common
  // case for every campaign that predates this column) ranks alongside
  // explicitly-remote ones rather than being promoted: only an explicit
  // in-person flag earns the boost, so this can't be gamed by silence.
  // Unconditional (not opt-in) since this is meant to be the new default
  // everywhere listCampaigns is used -- /campaigns' list view, its
  // Discover deck, and the curated system hubs (lib/systems.ts) all get
  // it automatically with no call-site changes.
  const formatRank = "CASE session_format WHEN 'in_person' THEN 0 WHEN 'hybrid' THEN 1 ELSE 2 END";
  const orderBy = `${formatRank} ASC, ${secondaryOrderBy}`;

  const total = (
    db
      .prepare(`SELECT COUNT(*) as count FROM campaigns ${whereClause}`)
      .get(params) as { count: number }
  ).count;

  const rows = db
    .prepare(
      `SELECT * FROM campaigns ${whereClause} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as CampaignRow[];
  const items = rows.map(rowToCampaign);

  return { items, total };
}
