export interface User {
  id: string;
  display_name: string;
  email: string;
  created_at: string;
}

export const DANGER_LEVELS = [
  "low-lethality",
  "moderate",
  "high-lethality",
  "deadly-osr",
] as const;

export type DangerLevel = (typeof DANGER_LEVELS)[number];

export const DANGER_LEVEL_LABELS: Record<DangerLevel, string> = {
  "low-lethality": "Low-lethality",
  moderate: "Moderate",
  "high-lethality": "High-lethality",
  "deadly-osr": "Deadly (OSR-style)",
};

/** Backlog #41 phase 1: a *structural* in-person-vs-remote field, distinct
 * from the existing free-text `location` (which today can hold a real
 * place OR literally the string "Online/Remote" -- there's no way to
 * query or rank on that distinction, only substring-match it). This is
 * the field discovery ranking (see listCampaigns' formatRank below) and
 * any future filter UI key off. Modeled as a three-value enum, not a
 * boolean, because a real in-person table that also streams for a remote
 * player is a genuinely distinct, common case, not a bug in either
 * direction -- following the exact `DANGER_LEVELS` nullable-enum
 * convention (a CHECK-constrained TEXT column, null meaning "the DM
 * hasn't said"). Phase 2 (real geocoded distance search) remains
 * explicitly blocked on a maps/geocoding API key -- see the backlog
 * entry and progress.md's dated session log for the full reasoning. */
export const SESSION_FORMATS = ["in_person", "remote", "hybrid"] as const;

export type SessionFormat = (typeof SESSION_FORMATS)[number];

export const SESSION_FORMAT_LABELS: Record<SessionFormat, string> = {
  in_person: "In person",
  remote: "Remote / online",
  hybrid: "Hybrid (in person, with remote seats)",
};

export interface Campaign {
  id: string;
  dm_id: string;
  title: string;
  description: string;
  system: string;
  capacity: number;
  accepting_requests: number; // 0 | 1
  cancelled: number; // 0 | 1
  next_session_at: string | null;
  /** DM-set, player-visible heads-up filter for how lethal/deadly this
   * table runs — explicitly not a scoreboard or a judgment on DM skill,
   * just advance notice for a player deciding whether to join. null means
   * the DM hasn't set one. */
  danger_level: DangerLevel | null;
  /** Free-text, coarse location (e.g. "Austin, TX" or "Online/Remote") —
   * deliberately not a precise geocoded address. A lighter-weight first
   * step toward "near me" discovery; empty string means unset. */
  location: string;
  /** DM-set, player-visible heads-up flag (backlog #40) echoing the
   * prototype's "New player friendly" tag — signals a table that's
   * deliberately welcoming to someone new to tabletop gaming, not a
   * quality rating. Follows the exact danger_level convention: a simple
   * filterable field on the campaign, shown on the detail header and
   * browse cards. */
  new_player_friendly: number; // 0 | 1
  /** Backlog #41 phase 1: structural in-person/remote/hybrid flag -- see
   * SESSION_FORMATS' own doc comment above for why this exists alongside
   * (not instead of) the free-text `location` field. Null means the DM
   * hasn't set one; existing campaigns created before this column
   * existed default to null via the ALTER TABLE migration in lib/db.ts,
   * same as danger_level did. */
  session_format: SessionFormat | null;
  /** Backlog #30: free-text starting level/rank, not a rigid integer --
   * systems vary too much in how they express this ("Level 3" vs. "Tier
   * 2" vs. a narrative milestone like "just past the prologue") for a
   * number to be honest across every system this app supports. Follows
   * the same nullable-free-text-column convention as sub_requests.location
   * (backlog #29) -- null means the DM hasn't said, trimmed non-empty text
   * otherwise. See MAX_STARTING_LEVEL in lib/campaigns.ts for the length
   * cap. */
  starting_level: string | null;
  /** Backlog #30: curated multi-select tone/style tags -- a campaign can
   * genuinely be more than one of these at once (e.g. both "horror" and
   * "heavy-combat"), which is why this is a tag list rather than a single
   * closed enum like danger_level/session_format. Stored as a JSON-encoded
   * array in a TEXT column, parsed on read (see rowToCampaign in
   * lib/campaigns.ts) -- the exact pattern already established for
   * ratings.tags/campaign_ratings.tags. Validated against
   * CAMPAIGN_TONE_TAGS and capped at MAX_TONE_TAGS (lib/campaigns.ts);
   * always an array, defaulting to empty rather than null so callers never
   * need a null-check before iterating it. */
  tone_tags: CampaignToneTag[];
  /** Backlog #64 (owner-requested, live session): the DM-defined half of
   * the two-sided "what kind of table is this" questionnaire -- see
   * CAMPAIGN_SETTING_TAGS' own doc comment above for why this is a
   * separate multi-select from tone_tags rather than folded into it.
   * Same JSON-in-TEXT-column/parse-on-read shape (rowToCampaign in
   * lib/campaigns.ts), always an array, defaulting to empty. */
  setting_tags: CampaignSettingTag[];
  /** Backlog #64: which of the three pillars of play this table
   * emphasizes, most-emphasized first -- see GameplayFocusRanking's own
   * doc comment above. Always an array: either empty (DM hasn't ranked
   * it) or a full 3-item permutation, never a partial ranking. */
  gameplay_focus: GameplayFocusRanking;
  /** Backlog #64: how the campaign's narrative unfolds -- see
   * CampaignStructure's own doc comment above for why this single enum
   * is shared with Profile.structure_preference. Null means the DM
   * hasn't said, same nullable-enum convention as danger_level/
   * session_format. */
  structure: CampaignStructure | null;
  /** Backlog #67 (competitive research vs. StartPlaying.games): set once
   * at duplication time by duplicateCampaign (backlog #47), never updated
   * afterward. Points at the ultimate original a duplication lineage
   * descends from (flat, not a parent-chain -- see lib/db.ts's own doc
   * comment on this column). Null for any campaign not created via
   * duplicateCampaign. Powers the "Related sections / Other tables by
   * this DM" block on the campaign detail page (lib/campaigns.ts's
   * listRelatedCampaigns). */
  duplicated_from_id: string | null;
  /** Backlog #68 (competitive research vs. StartPlaying.games): when a
   * site admin (backlog #48) spotlighted this campaign for the home page,
   * or null if it isn't spotlighted. Only a site admin can set or clear
   * it (lib/campaigns.ts's setCampaignSpotlight); never copied by
   * duplicateCampaign. */
  spotlighted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Backlog #30: curated, closed vocabulary for a campaign's tone/style
 * tags -- multi-select (see Campaign.tone_tags' own doc comment for why
 * this is a tag list, not a single enum). Deliberately a fixed, curated
 * set (not free text) so the campaign browse filter can offer a real
 * checkbox list and match reliably, the same "curated over free-text"
 * trade-off already made for CAMPAIGN_RATING_TAGS/DM_RATING_TAGS/
 * PLAYER_RATING_TAGS above. */
export const CAMPAIGN_TONE_TAGS = [
  "horror",
  "heavy-combat",
  "roleplay-focused",
  "political-intrigue",
  "comedic",
  "mystery-investigation",
  "exploration",
  "one-shot-friendly",
  // Backlog #64: two more overall-mood options, rounding out the
  // vocabulary toward the owner's own "Overall Tone & Mood" reference
  // list -- "comedic"/"horror"/"mystery-investigation"/"political-intrigue"
  // above already covered most of that list, these two fill the
  // remaining gap (classic good-vs-evil heroics; harsher, morally mixed
  // survival play) without duplicating an existing tag.
  "heroic-fantasy",
  "gritty-realism",
] as const;

export type CampaignToneTag = (typeof CAMPAIGN_TONE_TAGS)[number];

export const CAMPAIGN_TONE_TAG_LABELS: Record<CampaignToneTag, string> = {
  horror: "Horror",
  "heavy-combat": "Heavy combat",
  "roleplay-focused": "Roleplay-focused",
  "political-intrigue": "Political intrigue",
  comedic: "Comedic",
  "mystery-investigation": "Mystery / investigation",
  exploration: "Exploration",
  "one-shot-friendly": "One-shot friendly",
  "heroic-fantasy": "Heroic fantasy",
  "gritty-realism": "Gritty realism",
};

/** Backlog #64 (owner-requested, live session): setting/environment tags --
 * a second, independent curated multi-select alongside CAMPAIGN_TONE_TAGS
 * above (a campaign's physical backdrop is orthogonal to its mood; a
 * "wilderness-frontier" table can be "comedic" or "gritty-realism" just as
 * easily). Same closed-vocabulary, JSON-encoded-array-column shape as
 * tone_tags throughout -- see CampaignSettingTag/Campaign.setting_tags'
 * own doc comments below, and MAX_SETTING_TAGS in lib/campaigns.ts. */
export const CAMPAIGN_SETTING_TAGS = [
  "high-fantasy",
  "urban",
  "wilderness-frontier",
  "nautical-swashbuckling",
  "steampunk-magitech",
  "cosmic-planar",
] as const;

export type CampaignSettingTag = (typeof CAMPAIGN_SETTING_TAGS)[number];

export const CAMPAIGN_SETTING_TAG_LABELS: Record<CampaignSettingTag, string> = {
  "high-fantasy": "High fantasy",
  urban: "Urban",
  "wilderness-frontier": "Wilderness / frontier",
  "nautical-swashbuckling": "Nautical / swashbuckling",
  "steampunk-magitech": "Steampunk / magitech",
  "cosmic-planar": "Cosmic / planar",
};

/** Backlog #64: the three classic "pillars of play," stored as a *ranked*
 * list rather than a multi-select -- unlike tone/setting (where a table
 * can genuinely be several things at once), gameplay focus is about
 * relative emphasis, which only a priority order expresses. A
 * GameplayFocusRanking is always either an empty array (unset -- the DM/
 * player hasn't said) or a full permutation of all three pillars, most-
 * emphasized first; see validateGameplayFocus in lib/campaigns.ts for the
 * enforcement. No drag-and-drop -- move-up/move-down controls, the same
 * convention this app's initiative tracker already established for
 * DM-facing reordering. */
export const GAMEPLAY_PILLARS = ["combat", "roleplay", "exploration"] as const;

export type GameplayPillar = (typeof GAMEPLAY_PILLARS)[number];

export type GameplayFocusRanking = GameplayPillar[];

export const GAMEPLAY_PILLAR_LABELS: Record<GameplayPillar, string> = {
  combat: "Combat & tactics",
  roleplay: "Roleplay & social interaction",
  exploration: "Exploration & discovery",
};

/** Backlog #64: how the narrative unfolds -- a single closed enum (a
 * table is one of these, not several), nullable, following the exact
 * DANGER_LEVELS/SESSION_FORMATS convention (a CHECK-constrained TEXT
 * column, null meaning "the DM/player hasn't said"). Reused verbatim as
 * both Campaign.structure (what the table actually is) and
 * Profile.structure_preference (what a player wants) -- unlike
 * SessionFormat/SessionFormatPreference, these values describe both
 * sides equally well, so there is no need for a second, smaller enum. */
export const CAMPAIGN_STRUCTURES = ["linear", "sandbox", "episodic"] as const;

export type CampaignStructure = (typeof CAMPAIGN_STRUCTURES)[number];

export const CAMPAIGN_STRUCTURE_LABELS: Record<CampaignStructure, string> = {
  linear: "Linear / driven",
  sandbox: "Sandbox / open world",
  episodic: "Episodic",
};

export type MembershipStatus = "pending" | "approved" | "declined" | "left";

export interface Membership {
  id: string;
  campaign_id: string;
  user_id: string;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
}

export const NOTIFICATION_TYPES = [
  "join_requested",
  "join_approved",
  "join_declined",
  "member_left_dm",
  "member_left_party",
  "party_notes_updated",
  "session_log_posted",
  "schedule_updated",
  "campaign_cancelled",
  "rating_prompt",
  "session_log_kudos",
  "sub_volunteer",
  "sub_placement_pending",
  "sub_placement_resolved",
  "message_received",
  "campaign_chat_message",
  "campaign_resource_uploaded",
  "session_reminder",
  "board_reply",
  "friend_request",
  "friend_request_accepted",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  join_requested: "Someone requests to join your campaign",
  join_approved: "Your join request is approved",
  join_declined: "Your join request is declined",
  member_left_dm: "A player leaves your campaign",
  member_left_party: "A fellow party member leaves",
  party_notes_updated: "Shared party notes are updated",
  session_log_posted: "A new session log entry is posted",
  schedule_updated: "The next session date changes",
  campaign_cancelled: "A campaign you're in is cancelled",
  rating_prompt: "You're invited to rate a DM or player after leaving a campaign",
  session_log_kudos: "Someone gives kudos to your session log entry",
  sub_volunteer: "Someone volunteers to sub in for your campaign",
  sub_placement_pending: "A sub placement needs your review (owner or DM approval)",
  sub_placement_resolved: "A sub placement is confirmed, declined, or cancelled",
  message_received: "Someone sends you a direct message",
  campaign_chat_message: "Someone posts in your table's group chat",
  campaign_resource_uploaded: "A new file is added to your campaign's resource vault",
  session_reminder: "A reminder as your next scheduled session approaches",
  board_reply: "Someone replies to your discussion board thread",
  friend_request: "Someone sends you a friend request",
  friend_request_accepted: "Someone accepts your friend request",
};

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  campaign_id: string | null;
  /** See lib/db.ts's notifications table comment -- an optional second
   * link target for a notification that isn't campaign-shaped, e.g. a
   * message_received notification links to /messages/<related_user_id>.
   * Null for every notification type that predates backlog #31. */
  related_user_id: string | null;
  /** Backlog #43 (board reply notifications): a third, board-shaped link
   * target for a notification that isn't campaign- or user-shaped -- a
   * board_reply notification links to /boards/<slug>/<related_thread_id>.
   * The slug itself isn't stored here (it's looked up from the thread at
   * read time, mirroring lib/boards.ts's own enrich-on-read convention for
   * authorName/replyCount) so a deleted thread doesn't leave stale data
   * behind, just a null lookup. Null for every notification type that
   * predates this. */
  related_thread_id: string | null;
  message: string;
  read: number; // 0 | 1
  created_at: string;
}

export interface SessionLogEntry {
  id: string;
  campaign_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface SessionLogEntryWithKudos extends SessionLogEntry {
  kudosCount: number;
  viewerGaveKudos: boolean;
}

export interface UserStats {
  campaignsAsDm: number;
  campaignsAsPlayer: number;
  /** A proxy for "sessions run," not a literal session count: each session
   * log entry represents one recap a DM posted after a session, so the
   * count of entries a user has authored across every campaign they DM is
   * the closest honest measure this app's data model supports. */
  sessionsRun: number;
  /** Same proxy, from the other side of the table: session log entries
   * posted in campaigns where this user has (or had) an approved
   * membership, i.e. sessions they were actually part of as a player. */
  sessionsPlayed: number;
  charactersCreated: number;
  /** Distinct `system` values across every campaign this user has DMed or
   * played in (not just their stated preferences on their profile). */
  systemsPlayed: string[];
  /** The system appearing across the most campaigns this user has DMed or
   * played in, or null if they haven't been part of any campaign yet. */
  mostPlayedSystem: string | null;
  /** The campaign (among ones this user DMed or played in) with the most
   * session log entries — "longest" measured by recorded sessions rather
   * than wall-clock duration, since this app has no session-length or
   * campaign-end data to compute an actual elapsed time from. */
  longestCampaign: { id: string; title: string; sessionCount: number } | null;
}

export interface PartyNotes {
  campaign_id: string;
  content: string;
  updated_by: string | null;
  updated_at: string | null;
}

export type ScheduleStatus = "unscheduled" | "upcoming" | "past-due";

export interface Profile {
  user_id: string;
  bio: string;
  preferred_systems: string;
  availability: string;
  /** Free-text, coarse location (e.g. "Austin, TX" or "Online/Remote") —
   * same deliberately-imprecise scope as a campaign's own location field. */
  location: string;
  /** Backlog #40: a self-flag a brand-new player can set on their own
   * profile — "new to tabletop," echoing the prototype's "New player
   * friendly" tag from the campaign side (see Campaign.new_player_friendly
   * above). Not enforced or verified in any way — a signal, not a gate. */
  new_to_tabletop: number; // 0 | 1
  /** Backlog #41 phase 1: the symmetric preference on the player side of
   * the table, parallel to a campaign's own `session_format` -- but a
   * *preference* isn't the same shape as a campaign's actual format
   * ("hybrid" doesn't describe what a person wants the way it describes
   * what a table offers), so this is its own, smaller enum rather than
   * reusing SessionFormat. Purely informational/display for this phase
   * (shown on /players/[id], not wired into any ranking or matching
   * logic) -- null means no preference stated, distinct from the
   * explicit "either" value. */
  session_format_preference: SessionFormatPreference | null;
  /** Backlog #64 (owner-requested, live session): the player-side half of
   * the two-sided "what kind of table" questionnaire -- "the types of
   * games they enjoy most," in the owner's own words -- reusing the
   * exact same curated vocabularies as the campaign side (CAMPAIGN_TONE_
   * TAGS/CAMPAIGN_SETTING_TAGS/GAMEPLAY_PILLARS/CAMPAIGN_STRUCTURES/
   * DANGER_LEVELS) so a future matching/ranking feature can compare the
   * two sides directly without a translation layer. Purely informational/
   * display for this pass (shown on /players/[id], not wired into any
   * matching or ranking logic yet) -- the same "phase 1, display only"
   * scope backlog #41 phase 1's session_format_preference shipped with.
   * Content-boundary ("Lines & Veils") material was deliberately left out
   * of this pass -- see the dated session log entry for why. */
  tone_tags: CampaignToneTag[];
  setting_tags: CampaignSettingTag[];
  gameplay_focus_preference: GameplayFocusRanking;
  structure_preference: CampaignStructure | null;
  /** A player's own stated lethality/difficulty comfort, reusing
   * DangerLevel verbatim -- symmetric with a campaign's own danger_level,
   * which (unlike session_format) already describes a preference just as
   * naturally as it describes a table, so no separate enum is needed. */
  danger_level_preference: DangerLevel | null;
  updated_at: string | null;
}

/** See Profile.session_format_preference's own doc comment above. */
export const SESSION_FORMAT_PREFERENCES = ["in_person", "remote", "either"] as const;

export type SessionFormatPreference = (typeof SESSION_FORMAT_PREFERENCES)[number];

export const SESSION_FORMAT_PREFERENCE_LABELS: Record<SessionFormatPreference, string> = {
  in_person: "In person only",
  remote: "Remote only",
  either: "Either is fine",
};

/** Day-of-week display order for the structured availability grid
 * (backlog #27, phase 1). Index 0 = Monday, 6 = Sunday — an app-level
 * display convention, NOT the same as Date.prototype.getDay() (which is
 * 0 = Sunday). This is a recurring weekly pattern with no attached date,
 * so there's no calendar day to derive it from either way. */
export const AVAILABILITY_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Backlog #57 (owner-requested, scoped 2026-09-08): replaces the phase-1
 * named-block grid (morning/afternoon/evening/night, which "read
 * differently to different people" per the backlog's own text) with
 * specific clock hours -- the exact "day + hour time-block grid" the
 * item asks for. `hour` is 0-23 (0 = the 12am-1am hour, 23 = the
 * 11pm-midnight hour), and marking hour N means "free from N:00 to
 * N+1:00" -- lib/availability.ts's summarizeAvailabilityByDay() collapses
 * a contiguous run into a single readable range (e.g. hours 18/19/20
 * display as "6pm-9pm", matching the backlog's own worked example).
 *
 * Timezone decision (the backlog item explicitly calls this out as
 * needed): hours are stored and displayed exactly as the profile owner
 * entered them, in the owner's own local time -- there is no per-user
 * timezone field anywhere else in this app to convert *from*, and adding
 * one (detection, storage, a picker, DST handling) is a materially
 * bigger feature than this item's own "so availability means the same
 * thing to every viewer" framing calls for. "Same thing to every viewer"
 * is satisfied by replacing a vague word ("evenings") with an
 * unambiguous clock time -- not by attempting cross-timezone conversion,
 * which would need data this app doesn't collect. Every place this
 * renders publicly (see app/players/[id]/page.tsx) says whose local time
 * it is, so a viewer elsewhere isn't misled into reading it as their own.
 *
 * The old block-shaped model (AVAILABILITY_BLOCKS/AvailabilityBlock) and
 * its `availability_slots` table are retired but deliberately left in
 * lib/db.ts's schema rather than dropped -- this app never drops
 * columns/tables, the same reasoning that kept the free-text `availability`
 * field on Profile in place after phase 1 shipped the structured grid
 * alongside it. */
export interface AvailabilitySlot {
  /** 0-6, see AVAILABILITY_DAYS. */
  day: number;
  /** 0-23, the profile owner's own local clock hour. */
  hour: number;
}

/** Phase 1 of backlog #20 (substitute player workflow) -- the request +
 * volunteer pool. A request starts "open" and moves to a terminal state
 * ("filled" or "cancelled"). Phase 2 (owner/DM approval + temporary
 * custody, see SubPlacement below) only applies to a request that names
 * a character -- a characterless request stays phase-1-only, marked
 * filled/cancelled directly with no owner or custody to hand off. */
export const SUB_REQUEST_STATUSES = ["open", "filled", "cancelled"] as const;

export type SubRequestStatus = (typeof SUB_REQUEST_STATUSES)[number];

export interface SubRequest {
  id: string;
  campaign_id: string;
  requester_id: string;
  /** null for a characterless request, which can only ever be resolved
   * directly (phase 1) -- it never enters the phase-2 approval flow. */
  character_id: string | null;
  note: string;
  /** Backlog #29: nullable ISO-8601 timestamp for the specific session
   * this sub is needed for, mirroring campaigns.next_session_at -- see
   * lib/schedule.ts's computeScheduleStatus(), reused as-is to derive an
   * upcoming/past-due status for this date too (see SubRequestSummary's
   * neededAtStatus below). Null means the requester didn't give a
   * specific date/time -- the free-text note might still mention one in
   * prose, but there's nothing structured to sort/filter on. */
  needed_at: string | null;
  /** Backlog #29: an explicit per-request override of the campaign's own
   * location field. Null (the common, default case) means "use the
   * campaign's location" -- see SubRequestSummary's campaignLocation,
   * which always carries that fallback value for display. Only set when
   * the requester explicitly types a different location for this
   * specific session (e.g. a one-off at a different table/venue). */
  location: string | null;
  status: SubRequestStatus;
  created_at: string;
  updated_at: string;
}

export interface SubVolunteer {
  id: string;
  request_id: string;
  volunteer_id: string;
  message: string;
  created_at: string;
}

/** A sub request enriched with the display context the browse pool and
 * campaign-page panel need -- computed server-side (joins against
 * campaigns/users) so client components never need direct DB access,
 * matching the client-safe-types convention used throughout this file. */
export interface SubRequestSummary extends SubRequest {
  campaignTitle: string;
  campaignSystem: string;
  /** Backlog #29: the campaign's own location field, always included so
   * the UI can show it as the effective location whenever this request's
   * own `location` override is null -- see the field's doc comment above. */
  campaignLocation: string;
  requesterName: string;
  characterName: string | null;
  volunteerCount: number;
  viewerHasVolunteered: boolean;
  /** Backlog #29: computeScheduleStatus() (lib/schedule.ts) applied to
   * needed_at -- "unscheduled" when needed_at is null, otherwise
   * "upcoming"/"past-due" the same UTC-safe way campaigns.next_session_at
   * is judged. */
  neededAtStatus: ScheduleStatus;
}

export interface SubVolunteerWithName extends SubVolunteer {
  volunteerName: string;
}

/** Phase 2 of backlog #20: once a character-linked request has
 * volunteers, the requester (always the character's owner -- see
 * lib/subRequests.ts's validation) or the campaign's DM picks one to
 * move forward as a "placement". Needs both the owner and DM to approve
 * before it's "confirmed" and temporary custody transfers. Per an
 * explicit product decision (2026-09-06), the rest of the active party
 * is notified but isn't a blocking approval gate -- informational only,
 * to keep this state machine bounded to two approvers, not an
 * open-ended group vote. Either approver declining, or the requester/DM
 * cancelling outright, ends the placement without confirming it; the
 * parent request stays "open" so a new placement can be created. */
export const SUB_PLACEMENT_STATUSES = ["pending", "confirmed", "declined", "cancelled"] as const;

export type SubPlacementStatus = (typeof SUB_PLACEMENT_STATUSES)[number];

export interface SubPlacement {
  id: string;
  request_id: string;
  volunteer_id: string;
  /** Free-text guardrails the character owner attaches when reviewing --
   * e.g. "no permanent character death, ask before spending our one rare
   * potion." Informational for the volunteer and DM, not programmatically
   * enforced (this app has no gameplay to enforce it during). */
  guardrails_note: string;
  owner_approved: number; // 0 | 1
  dm_approved: number; // 0 | 1
  status: SubPlacementStatus;
  created_at: string;
  updated_at: string;
}

/** A placement enriched with display context -- computed server-side,
 * same reasoning as SubRequestSummary above. */
export interface SubPlacementSummary extends SubPlacement {
  volunteerName: string;
  characterName: string;
  ownerId: string;
  ownerName: string;
  dmId: string;
  dmName: string;
}

export const CHARACTER_AVATARS = [
  "🧙‍♂️",
  "🧙‍♀️",
  "🗡️",
  "🛡️",
  "🏹",
  "🐉",
  "🧝‍♀️",
  "🧝‍♂️",
  "🧌",
  "👑",
  "🔮",
  "🪄",
  "🦸‍♂️",
  "🦸‍♀️",
  "🥷",
  "🧛‍♂️",
  "🧛‍♀️",
  "🐺",
  "🦉",
  "🎲",
] as const;

export const CHARACTER_STATUSES = ["active", "retired", "fallen"] as const;

export type CharacterStatus = (typeof CHARACTER_STATUSES)[number];

export const CHARACTER_STATUS_LABELS: Record<CharacterStatus, string> = {
  active: "Still adventuring",
  retired: "Retired",
  fallen: "Fallen",
};

/** Backlog #56 (owner-requested, scoped 2026-09-08): the real 5e stat
 * block, stored only for a character linked to a campaign that matches
 * the curated "dnd-5e" system (see lib/systems.ts's systemMatchPatterns
 * and lib/characters.ts's isLinkedToDnd5e -- enforced there, not here).
 * Explicitly scoped to 5e only, per the backlog item's own text --
 * every other system keeps today's simpler archetype/bio/backstory
 * model unchanged; a template-driven sheet for other systems is a
 * possible future item, not attempted here. */
export const ABILITY_SCORES_5E = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type AbilityScore5e = (typeof ABILITY_SCORES_5E)[number];

export const ABILITY_SCORE_5E_LABELS: Record<AbilityScore5e, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const SKILLS_5E = [
  "acrobatics",
  "animal_handling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleight_of_hand",
  "stealth",
  "survival",
] as const;
export type Skill5e = (typeof SKILLS_5E)[number];

export const SKILL_5E_LABELS: Record<Skill5e, string> = {
  acrobatics: "Acrobatics",
  animal_handling: "Animal Handling",
  arcana: "Arcana",
  athletics: "Athletics",
  deception: "Deception",
  history: "History",
  insight: "Insight",
  intimidation: "Intimidation",
  investigation: "Investigation",
  medicine: "Medicine",
  nature: "Nature",
  perception: "Perception",
  performance: "Performance",
  persuasion: "Persuasion",
  religion: "Religion",
  sleight_of_hand: "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
};

/** Each skill's governing ability score, per the 5e rules -- used to
 * compute a skill's bonus (ability modifier + proficiency bonus if
 * proficient) in lib/sheet5e.ts. */
export const SKILL_5E_ABILITY: Record<Skill5e, AbilityScore5e> = {
  acrobatics: "dex",
  animal_handling: "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  sleight_of_hand: "dex",
  stealth: "dex",
  survival: "wis",
};

/** The number of spell levels 5e defines (1st through 9th) --
 * Sheet5e.spellSlots is always exactly this many entries long, index 0 =
 * 1st-level slots ... index 8 = 9th-level slots. Zero throughout for a
 * non-caster; the backlog item's own text calls this out as "spell slots
 * where relevant," not a required field only casters fill in. */
export const SPELL_SLOT_LEVELS_5E = 9;

export interface Sheet5e {
  abilityScores: Record<AbilityScore5e, number>;
  proficiencyBonus: number;
  savingThrowProficiencies: readonly AbilityScore5e[];
  skillProficiencies: readonly Skill5e[];
  armorClass: number;
  hitPointsMax: number;
  hitPointsCurrent: number;
  /** Free-text dice notation, e.g. "3d8". */
  hitDice: string;
  /** Free text, matching this app's existing convention for bio/backstory
   * -- a structured item-by-item inventory (weight, quantity, magic item
   * flags, etc.) is a larger feature of its own, not what this backlog
   * item asked for ("an equipment list"), so a DM/player can format it
   * as a list themselves. */
  equipment: string;
  /** Exactly SPELL_SLOT_LEVELS_5E entries, index 0 = 1st level. */
  spellSlots: readonly number[];
}

export interface Character {
  id: string;
  user_id: string;
  campaign_id: string | null;
  name: string;
  archetype: string;
  bio: string;
  backstory: string;
  avatar_emoji: string;
  status: CharacterStatus;
  /** Free-text "how it ended" line — how a retired character stepped away,
   * or how a fallen one met their end. Meaningful mainly once status isn't
   * "active", but not restricted at the data layer to allow e.g. writing
   * it in advance before formally retiring a character. */
  epilogue: string;
  /** An uploaded portrait, stored as a data: URL (base64) directly in
   * SQLite — the simplest no-new-infrastructure option, deliberately kept
   * small (see MAX_PORTRAIT_BYTES in lib/characters.ts) to limit database
   * bloat. null means no upload; avatar_emoji is shown instead. Revisit
   * with real object storage once a deployment target is chosen. */
  portrait_data_url: string | null;
  /** Set when a sub-placement is confirmed for this character (backlog
   * #20 phase 2) -- the user id of whoever is currently piloting it for a
   * session in the owner's place. null the rest of the time. A pure
   * display marker, cleared by an explicit "end sub" action; this app has
   * no session-duration tracking to clear it automatically. */
  temp_pilot_user_id: string | null;
  /** Backlog #56: the full 5e stat block, present only for a character
   * currently linked to a campaign matching the curated "dnd-5e" system
   * (see lib/characters.ts's isLinkedToDnd5e) -- null otherwise, including
   * for a character that has one but is later unlinked from its 5e
   * campaign (the data isn't cleared automatically, but the UI only
   * offers to view/edit it while currently 5e-linked -- see
   * CharacterManager's own doc comment for that judgment call). */
  sheet_5e: Sheet5e | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignChronicle {
  active: number;
  retired: number;
  fallen: number;
  /** Total currently linked to this campaign (active + retired + fallen).
   * Named distinctly from the individual counts since "characters passed
   * through" reads more naturally as a single headline number. */
  total: number;
}

export const DM_RATING_TAGS = [
  "Great narrator",
  "Fair rulings",
  "Well prepared",
  "On time",
  "Flexible with rules",
  "Great worldbuilding",
  "Good communicator",
  "Fun to play with",
] as const;

export const PLAYER_RATING_TAGS = [
  "On time",
  "Team player",
  "Good roleplayer",
  "Well prepared",
  "Great communicator",
  "Follows the story",
  "Fun to have at the table",
  "Respectful of others",
] as const;

export type RatingTag =
  | (typeof DM_RATING_TAGS)[number]
  | (typeof PLAYER_RATING_TAGS)[number];

export type RateeRole = "dm" | "player";

export interface Rating {
  id: string;
  campaign_id: string;
  rater_id: string;
  ratee_id: string;
  ratee_role: RateeRole;
  stars: number;
  tags: string[];
  /** Backlog #65: an optional free-text review, alongside the existing
   * stars/tags -- additive, the tag system is unchanged. Empty string
   * (never null) when the rater left no comment, matching this app's
   * existing "NOT NULL DEFAULT ''" convention for optional free-text
   * columns (see e.g. Character.bio). */
  comment: string;
  created_at: string;
  updated_at: string;
}

/** One rating's worth of review data, surfaced on a reputation display --
 * only ratings with a non-empty `comment` are ever turned into a Review,
 * so a caller never has to check for an empty string itself. */
export interface RatingReview {
  raterId: string;
  stars: number;
  comment: string;
  updatedAt: string;
}

export interface RatingSummary {
  asDm: {
    average: number | null;
    count: number;
    tagCounts: Record<string, number>;
    reviews: RatingReview[];
  };
  asPlayer: {
    average: number | null;
    count: number;
    tagCounts: Record<string, number>;
    reviews: RatingReview[];
  };
}

/** Backlog #28: rating the campaign itself, not just the DM/players --
 * "the table's vibe" rather than any one person's performance. A
 * separate concept from RatingTag above (which is person-specific and
 * split dm/player); campaign tags apply to every campaign uniformly. */
export const CAMPAIGN_RATING_TAGS = [
  "Well organized",
  "True to the pitch",
  "Welcoming to newcomers",
  "Great worldbuilding",
  "Balanced combat & roleplay",
  "Reliable scheduling",
  "Great communication",
  "Would recommend",
] as const;

export type CampaignRatingTag = (typeof CAMPAIGN_RATING_TAGS)[number];

export interface CampaignRating {
  id: string;
  campaign_id: string;
  rater_id: string;
  stars: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CampaignRatingSummary {
  average: number | null;
  count: number;
  tagCounts: Record<string, number>;
}

/** Backlog #31: 1:1 direct messaging. A "conversation" is never a stored
 * entity of its own -- it's the unique unordered pair of
 * (sender_id, recipient_id) across a user's messages, computed at query
 * time by lib/messages.ts. Any signed-in user can message any other
 * signed-in user -- see lib/messages.ts for the full reasoning. `read`
 * is from the recipient's perspective only (same shape as
 * notifications.read), and has no bearing on a message's own
 * notification -- those are two independent "unread" concepts tracked
 * in two different tables. */
export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read: number; // 0 | 1
  created_at: string;
}

/** One row per conversation partner, enriched for the inbox view -- the
 * most recent message with that partner plus how many of their messages
 * to the viewer are still unread. Computed server-side (a join against
 * users), matching this file's existing client-safe-types convention. */
export interface ConversationSummary {
  otherUserId: string;
  otherUserName: string;
  lastMessage: {
    body: string;
    createdAt: string;
    senderId: string;
  };
  unreadCount: number;
}

/** Backlog #32: a group thread per campaign's active party, separate
 * from 1:1 direct messages (backlog #31's Message type above, an
 * unrelated pairwise table) and from PartyNotes (a persistent shared
 * document, not a conversation history). Reuses the (sender, body,
 * created_at) message shape from #31, scoped to a campaign instead of
 * a user pair. Visibility is exactly the hasPrivateAccess boundary (DM
 * + approved active members) already gating party notes/session log --
 * a message posted by someone who has since left stays visible in the
 * thread's history to the remaining party (history isn't rewritten),
 * but the departed member themselves loses read/write access the same
 * way they lose the rest of the private side. */
export interface CampaignMessage {
  id: string;
  campaign_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

/** A campaign chat message enriched with the sender's display name --
 * computed server-side, matching this file's existing client-safe-types
 * convention (e.g. ConversationSummary above). */
export interface CampaignMessageWithSender extends CampaignMessage {
  senderName: string;
}

/** Backlog #33: DM dashboard basics -- an initiative tracker. A
 * per-campaign, DM-managed ordered list of combatant entries -- session-
 * local *working* state (like PartyNotes, it persists as "current
 * state" until the DM explicitly clears it, rather than resetting
 * automatically -- this app has no discrete "session" entity to reset
 * against). order_index is maintained by the app via explicit
 * move-up/move-down actions, independent of the `initiative` value
 * itself -- see lib/initiativeTracker.ts for the full reasoning. hp is
 * free text (e.g. "18/24") rather than a bare number, and notes is a
 * short free-text field for conditions/reminders. DM-only -- not shown
 * to players, unlike the rest of a campaign's private side. */
export interface InitiativeEntry {
  id: string;
  campaign_id: string;
  name: string;
  initiative: number;
  hp: string | null;
  notes: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

/** Backlog #33: DM dashboard basics -- NPC quick-notes. A lightweight
 * per-campaign list of NPC name + free-text notes, the same shape the
 * backlog line itself described rather than a separate "quick notes"
 * concept. DM-only -- a prep/running tool for the DM's eyes, not shown
 * to players. See lib/npcNotes.ts. */
export interface NpcNote {
  id: string;
  campaign_id: string;
  name: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** Backlog #34, phase 1: resource vault -- per-campaign uploads (maps,
 * handouts, homebrew notes). Follows the same base64 data: URL-in-SQLite
 * storage pattern already established for character portraits (#26),
 * but supports a broader allowed-type set (images, PDF, and plain text)
 * with a larger size cap -- see MAX_RESOURCE_DATA_URL_LENGTH in
 * lib/campaignResources.ts for the exact limit and its justification.
 * Visible to the campaign's active party (hasPrivateAccess -- DM +
 * approved active members), the same boundary as party notes/session
 * log/table chat -- not the cross-community library the backlog line
 * also describes, which is an explicitly out-of-scope phase 2 (needs
 * the system-hub browsing surface from backlog #36 to make sense as a
 * destination; see claude/progress.md). */
export interface CampaignResource {
  id: string;
  campaign_id: string;
  uploader_id: string;
  name: string;
  description: string;
  mime_type: string;
  data_url: string;
  created_at: string;
  updated_at: string;
}

/** A resource enriched with the uploader's display name -- computed
 * server-side, matching this file's existing client-safe-types
 * convention (e.g. CampaignMessageWithSender above). */
export interface CampaignResourceWithUploader extends CampaignResource {
  uploaderName: string;
}


/** Backlog #35: session RSVP. A member's confirm/decline for a
 * campaign's *current* next_session_at value -- see lib/db.ts's
 * session_rsvps table comment for why there's no stored session_at:
 * a reschedule clears every row for the campaign (lib/schedule.ts),
 * so any row that exists is always answering the campaign's present
 * next_session_at. "confirmed"/"declined" rather than a three-way
 * yes/no/maybe -- the backlog line's own wording is "confirm/decline",
 * and a no-row-yet state already covers "haven't said either way". */
export const RSVP_RESPONSES = ["confirmed", "declined"] as const;

export type RsvpResponse = (typeof RSVP_RESPONSES)[number];

export interface SessionRsvp {
  campaign_id: string;
  user_id: string;
  response: RsvpResponse;
  created_at: string;
  updated_at: string;
}

/** One row per active party member (DM + approved members), enriched
 * with display name and their current response (null = hasn't RSVPed
 * yet) -- the shape lib/sessionRsvps.ts's listRsvps() returns so the
 * "who's confirmed" summary can render directly, matching this file's
 * existing client-safe-types convention (e.g. CampaignMessageWithSender). */
export interface SessionRsvpSummary {
  userId: string;
  userName: string;
  isDm: boolean;
  response: RsvpResponse | null;
}

/** Backlog #36: curated system-specific hubs. `campaigns.system` stays
 * free text (see lib/campaigns.ts) -- forcing it onto a closed enum here
 * would break every existing campaign's arbitrary system string plus the
 * existing free-text keyword search (backlog #7). This is the resolution
 * to the tension the backlog item itself names: "curated" vs.
 * "system-agnostic, don't force an enum" isn't a contradiction as long as
 * the curated list is a browsing *layer* over the free text, not a
 * reclassification of it -- a hand-picked set of well-known systems
 * (matching the original prototype's own showcased set: 5e, Pathfinder
 * 2e, Call of Cthulhu, Vampire: The Masquerade, and the PbtA/Forged-in-
 * the-Dark family, split here into two distinct named systems rather than
 * one hub since they really are different systems) with a description
 * and a page listing campaigns whose free-text `system` matches its
 * name/aliases -- see lib/systems.ts for the matching logic. A campaign
 * whose `system` doesn't match any curated entry is exactly what the
 * prototype's own "+ your system" card was gesturing at: a real,
 * first-class campaign, just not featured on a curated hub -- it stays
 * fully visible via the ordinary /campaigns browse+search this app
 * already has, linked from the curated index as an explicit
 * "Other/homebrew" catch-all rather than silently dropped or blocked. */
export const CURATED_SYSTEMS = [
  "dnd-5e",
  "pathfinder-2e",
  "call-of-cthulhu",
  "vampire-masquerade",
  "blades-in-the-dark",
  "powered-by-the-apocalypse",
] as const;

export type CuratedSystemSlug = (typeof CURATED_SYSTEMS)[number];

/** Backlog #55: a single hand-picked external resource link shown on a
 * curated system hub page (e.g. the publisher's own site, a free rules
 * reference, or a Wikipedia overview). Just a label + URL -- there's no
 * further categorization since the backlog item scoped this to "a
 * hand-picked set", not a structured/typed resource directory. */
export interface CuratedSystemResourceLink {
  label: string;
  url: string;
}

export interface CuratedSystemInfo {
  name: string;
  description: string;
  /** Case-insensitive substring match patterns (in addition to `name`
   * itself) used to find campaigns whose free-text `system` field belongs
   * to this curated hub -- see lib/systems.ts's systemMatchPatterns()/
   * campaignsForSystem(). Best-effort, not authoritative: a DM can type
   * anything into `system`, so this can both miss real matches (an
   * unlisted phrasing) and never claims to be exhaustive. */
  aliases: readonly string[];
  /** Backlog #55 (owner-requested, scoped 2026-09-08): a hand-picked set
   * of external resources for this system -- the publisher/official site
   * plus a free rules reference and/or overview, matching the backlog
   * item's own example ("for 5e: Wizards of the Coast, a DNDBeyond-style
   * reference, Wikipedia"). Scoped to these six curated hubs only, not
   * the long tail of free-text `system` values elsewhere in the app --
   * see the doc comment on CURATED_SYSTEMS above. Every curated system
   * has at least one entry; order is display order on the hub page. */
  resources: readonly CuratedSystemResourceLink[];
}

export const CURATED_SYSTEM_INFO: Record<CuratedSystemSlug, CuratedSystemInfo> = {
  "dnd-5e": {
    name: "Dungeons & Dragons 5th Edition",
    description:
      "The best-selling modern tabletop RPG -- high-fantasy adventuring with classes, levels, and a d20 core. The default starting point for most new tables.",
    aliases: [
      "dungeons & dragons 5e",
      "dungeons and dragons 5e",
      "d&d 5e",
      "dnd 5e",
      "d&d5e",
      "dnd5e",
      "5th edition",
    ],
    resources: [
      { label: "Wizards of the Coast (publisher)", url: "https://dnd.wizards.com/" },
      { label: "D&D Beyond (official digital toolset)", url: "https://www.dndbeyond.com/" },
      { label: "Wikipedia overview", url: "https://en.wikipedia.org/wiki/Dungeons_%26_Dragons" },
    ],
  },
  "pathfinder-2e": {
    name: "Pathfinder 2nd Edition",
    description:
      "Paizo's crunchy, tactical d20 fantasy system -- deeper character-building options and more structured combat than 5e, from the studio that grew out of the original D&D 3.5e OGL.",
    aliases: ["pathfinder 2e", "pathfinder second edition", "pathfinder 2nd edition", "pf2e", "pf2"],
    resources: [
      { label: "Paizo (publisher)", url: "https://paizo.com/pathfinder" },
      { label: "Archives of Nethys (free rules reference)", url: "https://2e.aonprd.com/" },
      { label: "Wikipedia overview", url: "https://en.wikipedia.org/wiki/Pathfinder_Roleplaying_Game" },
    ],
  },
  "call-of-cthulhu": {
    name: "Call of Cthulhu",
    description:
      "Lovecraftian horror investigation using the Basic Roleplaying (BRP) percentile system -- sanity loss, cosmic dread, and mysteries better solved than fought.",
    aliases: ["call of cthulhu", "cthulhu", "coc"],
    resources: [
      { label: "Chaosium (publisher)", url: "https://www.chaosium.com/call-of-cthulhu/" },
      {
        label: "Wikipedia overview",
        url: "https://en.wikipedia.org/wiki/Call_of_Cthulhu_(role-playing_game)",
      },
    ],
  },
  "vampire-masquerade": {
    name: "Vampire: The Masquerade",
    description:
      "World of Darkness gothic-punk horror -- play a vampire navigating political intrigue, hunger, and humanity, using the Storyteller system.",
    aliases: ["vampire: the masquerade", "vampire the masquerade", "vtm"],
    resources: [
      { label: "World of Darkness (publisher)", url: "https://www.worldofdarkness.com/vampire-the-masquerade" },
      { label: "Wikipedia overview", url: "https://en.wikipedia.org/wiki/Vampire:_The_Masquerade" },
    ],
  },
  "blades-in-the-dark": {
    name: "Blades in the Dark",
    description:
      "A heist-driven crew of scoundrels in a haunted industrial city, using the Forged in the Dark system -- flashbacks, clocks, and a focus on consequences over dice-fishing.",
    aliases: ["blades in the dark", "bitd", "forged in the dark"],
    resources: [
      { label: "Blades in the Dark (official site)", url: "https://bladesinthedark.com/" },
      { label: "Wikipedia overview", url: "https://en.wikipedia.org/wiki/Blades_in_the_Dark" },
    ],
  },
  "powered-by-the-apocalypse": {
    name: "Powered by the Apocalypse (PbtA)",
    description:
      "A narrative-first family of systems (Apocalypse World, Monsterhearts, Masks, and many others) built around move-driven fiction rather than simulationist rules.",
    aliases: ["powered by the apocalypse", "pbta", "apocalypse world"],
    resources: [
      { label: "Apocalypse World (official site)", url: "https://apocalypse-world.com/" },
      { label: "Wikipedia overview", url: "https://en.wikipedia.org/wiki/Powered_by_the_Apocalypse" },
    ],
  },
};

/** Pure, client-safe (no DB import) case-insensitive substring check of
 * whether a campaign's free-text `system` matches a curated system's
 * name/aliases. Exists for backlog #56: CharacterManager.tsx (a "use
 * client" component) needs to decide whether to show the 5e stat-block
 * section for whichever campaign is currently selected in its own form,
 * but can't import lib/systems.ts's own systemMatchPatterns() for that --
 * systems.ts pulls in lib/campaigns.ts, which pulls in lib/db.ts's
 * better-sqlite3 (a native Node addon that can't bundle for the
 * browser). This is only ever used to decide what to *show*; the actual
 * write-time enforcement is lib/characters.ts's isLinkedToDnd5e
 * (server-side), which is free to (and does) use systemMatchPatterns. */
export function curatedSystemMatches(system: string, slug: CuratedSystemSlug): boolean {
  const info = CURATED_SYSTEM_INFO[slug];
  const lower = system.toLowerCase();
  return (
    lower.includes(info.name.toLowerCase()) ||
    info.aliases.some((alias) => lower.includes(alias.toLowerCase()))
  );
}

/** Backlog #37: lightweight community discussion boards. The concrete
 * first slice of backlog #25 (clubs/curated community lists), scoped
 * narrow per that item's own text: a fixed, curated set of topic boards
 * (not user-created ones), each with flat threads + flat replies (no
 * nesting) and "light moderation" meaning self-moderation only -- a
 * thread/reply's own author can delete it, and there is deliberately no
 * admin/reporting system yet (that's a bigger, separate feature; see
 * claude/progress.md for the explicit scope cut). Not campaign-scoped --
 * these are topic-based (BoardGameGeek/Discord forum-channel style), a
 * different axis from every other private/campaign-gated feature in this
 * app. Browsing is public, matching campaign browsing/sub pool/system
 * hubs; posting a thread or reply requires sign-in. */
export const BOARD_TOPICS = [
  "new-player-questions",
  "homebrew-showcase",
  "lfg-advice",
  "local-meetups",
] as const;

export type BoardSlug = (typeof BOARD_TOPICS)[number];

export interface BoardInfo {
  name: string;
  description: string;
}

export const BOARD_INFO: Record<BoardSlug, BoardInfo> = {
  "new-player-questions": {
    name: "New Player Questions",
    description:
      "New to tabletop RPGs, or new to a specific system? Ask anything here -- rules, etiquette, what to bring to your first session.",
  },
  "homebrew-showcase": {
    name: "Homebrew & House Rules",
    description:
      "Share homebrew classes, settings, one-shots, and house-rule variants you've built for your own table.",
  },
  "lfg-advice": {
    name: "Looking for Group Advice",
    description:
      "Trouble finding a table or filling one? Swap advice on writing a good pitch, screening players, or what to do when a group falls through.",
  },
  "local-meetups": {
    name: "Local Meetups & In-Person Games",
    description:
      "Organize or find in-person meetups, game stores, and conventions running tabletop games near you -- this app's own in-person-first product direction, given a place to talk about it.",
  },
};

export interface BoardThread {
  id: string;
  board_slug: BoardSlug;
  author_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

/** A thread enriched with the author's display name and its reply count --
 * computed server-side, matching this file's existing client-safe-types
 * convention (e.g. CampaignMessageWithSender). */
export interface BoardThreadWithAuthor extends BoardThread {
  authorName: string;
  replyCount: number;
}

/** Flat, not nested -- a reply always belongs to a thread directly, never
 * to another reply, matching the backlog line's own "keep it simple"
 * framing. */
export interface BoardReply {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface BoardReplyWithAuthor extends BoardReply {
  authorName: string;
}

/** Backlog #48: a report against a single thread or reply, filed by a
 * signed-in user for a site admin to review. Exactly one of thread_id/
 * reply_id is set (see lib/db.ts's board_reports table comment) --
 * mirrored here as both fields nullable rather than a discriminated
 * union, matching how BoardThread/BoardReply themselves are plain row
 * shapes elsewhere in this file. */
export interface BoardReport {
  id: string;
  reporter_id: string;
  thread_id: string | null;
  reply_id: string | null;
  reason: string;
  created_at: string;
}

/** Backlog #48: one row in the admin moderation queue at /admin/boards --
 * a thread or reply enriched with its report count and enough context
 * (board, author, an excerpt) to review without a second click. See
 * lib/boards.ts's listReportedContent(). */
export interface ReportedBoardPost {
  kind: "thread" | "reply";
  /** The thread's own id, or the reply's own id -- whichever this post is. */
  id: string;
  /** For a reply, its parent thread's id (for linking back to it); for a
   * thread, the same value as id. */
  threadId: string;
  boardSlug: BoardSlug;
  authorId: string;
  authorName: string;
  /** The thread's own title, or "Reply to "<thread title>"" for a reply. */
  title: string;
  /** A truncated excerpt of the post's body, for display in the queue. */
  excerpt: string;
  reportCount: number;
  createdAt: string;
}

/** Backlog #38: opt-in following + a lightweight public activity feed.
 * See lib/db.ts's follows table comment for the "who can follow whom"
 * judgment call (open, no shared-campaign gate -- matching #31's
 * messaging precedent) and lib/follows.ts for the enforcement logic. */
export interface Follow {
  id: string;
  follower_id: string;
  followed_id: string;
  created_at: string;
}

/** Backlog #59: a mutual friend relationship -- see lib/db.ts's
 * friendships table comment for the "one row, direction = original
 * request" shape and lib/friends.ts for the enforcement logic. A
 * 'pending' row is a not-yet-acted-on request from requester_id to
 * addressee_id; 'accepted' means both users are friends and the
 * original direction is no longer meaningful for display (see
 * listFriends(), which returns "the other user" regardless of which
 * side sent the original request). There's no 'declined' status --
 * declining or cancelling a pending request deletes the row (see the
 * table comment for why). */
export type FriendshipStatus = "pending" | "accepted";

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
}

/** A viewer-relative summary of where things stand between the current
 * user and some other user -- computed by lib/friends.ts's
 * getFriendshipStatus(), driving which button/state /players/[id] and
 * FriendButton show. */
export type FriendshipViewerStatus =
  | "self"
  | "friends"
  | "request_sent"
  | "request_received"
  | "none";

/** See lib/db.ts's feed_events table comment for the full privacy-
 * boundary reasoning -- every event type here surfaces something already
 * fully public elsewhere in this app (a character's status/existence on
 * /players/[id], a campaign's accepting_requests/rating on its own
 * detail page). Never session-log/party-notes/chat content, which stays
 * behind hasPrivateAccess() exactly as it does everywhere else. */
export const FEED_EVENT_TYPES = [
  "character_created",
  "character_status_changed",
  "campaign_became_full",
  "campaign_first_rated",
] as const;

export type FeedEventType = (typeof FEED_EVENT_TYPES)[number];

export interface FeedEvent {
  id: string;
  actor_id: string;
  type: FeedEventType;
  campaign_id: string | null;
  character_id: string | null;
  message: string;
  created_at: string;
}

/** A feed event enriched with the actor's display name -- computed
 * server-side, matching this file's existing client-safe-types
 * convention (e.g. CampaignMessageWithSender). */
export interface FeedEventWithActor extends FeedEvent {
  actorName: string;
}

/** Backlog #39: attendance-based reliability signal. Judgment call,
 * documented in full in lib/attendance.ts and claude/progress.md:
 * backlog #35's session_rsvps records *intent* to attend the next
 * session, not whether someone actually showed up, and isn't even a
 * durable history (a reschedule wipes every row for the campaign -- see
 * the session_rsvps comment in lib/db.ts). The only durable per-session
 * record this app has is a session_log_entries row, so honest attendance
 * has to hang off that instead of RSVP data. This table is a DM-attested
 * record ("who actually showed up"), optionally populated when the DM
 * posts or edits a session log entry -- no row for a (entry, user) pair
 * means "not recorded", never "recorded as absent". */
export interface SessionLogAttendance {
  entry_id: string;
  user_id: string;
  attended: number; // 0 | 1
  created_at: string;
}

/** One row per current attendance-marking candidate for a given entry --
 * the campaign's active party minus the DM (see lib/attendance.ts) --
 * enriched with display name and the DM's recorded attended value: null
 * means nobody has recorded it yet, distinct from an explicit "did not
 * attend". Matches this file's existing client-safe-types convention
 * (e.g. SessionRsvpSummary). */
export interface SessionLogAttendanceSummary {
  userId: string;
  userName: string;
  attended: boolean | null;
}

/** A user's aggregate "shows up" signal, derived only from explicit
 * DM-recorded attendance (never from RSVP intent -- see
 * SessionLogAttendance above). `recorded` is how many session log
 * entries someone actually has an attendance record for; `rate` is null
 * (not 0%) when recorded is 0, matching this app's established
 * unrated-not-zero convention (e.g. RatingSummary) rather than reading a
 * brand-new or never-marked user as unreliable. Deliberately player-only
 * -- attendance rows are never written for a campaign's own DM (a DM is
 * presumed present for every entry they themselves post), so this never
 * tracks a DM's own attendance. */
export interface AttendanceStats {
  recorded: number;
  attended: number;
  rate: number | null;
}

/** Backlog #50: a signed-in user's complete self-service data export --
 * every row across this app's schema that traces back to their own
 * account, flattened into one JSON-serializable object for download (see
 * lib/accountExport.ts's getAccountExport() for the full field-by-field
 * sourcing and claude/progress.md's dated session log entry for the
 * scope/judgment-call writeup, in particular why full account *deletion*
 * is explicitly NOT built alongside this export -- a DM-owned campaign
 * with an active party can't be safely hard-deleted without a product
 * decision this pass didn't make). `account` never includes
 * password_hash, matching this file's existing client-safe-types
 * convention (see User above). Every array is empty (never omitted) for
 * a brand-new user with no activity, mirroring UserStats' own
 * all-zero-for-a-new-user convention -- a fresh export is a valid,
 * fully-shaped document, not a partial one. */
export interface AccountExportData {
  exportedAt: string;
  account: {
    id: string;
    displayName: string;
    email: string;
    isAdmin: boolean;
    createdAt: string;
  };
  profile: Profile;
  availabilitySlots: AvailabilitySlot[];
  notificationPreferences: Record<string, boolean>;
  characters: Character[];
  /** Campaigns this user DMs -- the full owned record, not just the
   * public-facing fields. Campaigns they merely play in show up in
   * `memberships` below instead (a membership row plus that campaign's
   * id/title), not duplicated here as a second full Campaign copy. */
  campaignsAsDm: Campaign[];
  /** Every membership row for this user across every status (pending,
   * approved, declined, left) -- broader than lib/profiles.ts's
   * myCampaigns() (approved-only), since a full data export should
   * include a join request that was declined too, not just active
   * memberships. Enriched with the campaign's own title so the export is
   * readable without cross-referencing ids by hand. */
  memberships: (Membership & { campaignTitle: string })[];
  subRequestsPosted: SubRequest[];
  subVolunteered: SubVolunteer[];
  /** Every sub placement where this user is either the volunteer or the
   * request's own owner (the character owner is always the request's
   * requester -- see lib/subRequests.ts) -- covers both sides of the
   * approval workflow this user could appear on. */
  subPlacements: SubPlacement[];
  directMessagesSent: Message[];
  directMessagesReceived: Message[];
  campaignMessagesSent: CampaignMessage[];
  ratingsGiven: Rating[];
  ratingsReceived: Rating[];
  campaignRatingsGiven: CampaignRating[];
  sessionLogEntriesAuthored: SessionLogEntry[];
  sessionLogKudosGiven: { entryId: string; createdAt: string }[];
  notifications: Notification[];
  following: { userId: string; displayName: string; since: string }[];
  followers: { userId: string; displayName: string; since: string }[];
  boardThreadsAuthored: BoardThread[];
  boardRepliesAuthored: BoardReply[];
  boardReportsFiled: BoardReport[];
  /** Public feed events where this user is the actor -- already fully
   * public elsewhere (see feed_events' own privacy-boundary comment in
   * lib/db.ts), included here purely for completeness of "everything
   * this app has recorded about you." */
  feedEvents: FeedEvent[];
  sessionRsvps: SessionRsvp[];
  /** DM-recorded attendance rows *about* this user (did they show up to
   * a given session log entry) -- present here because it's data this
   * app holds about the user, even though they didn't create it
   * themselves; a DM's own attendance-marking activity for their
   * campaigns isn't separately exported. */
  sessionLogAttendanceRecorded: SessionLogAttendance[];
  campaignResourcesUploaded: CampaignResource[];
  /** DM-only prep tools (initiative tracker entries, NPC notes) for
   * campaigns this user DMs -- included since they're this user's own
   * authored content, not shown to anyone else. */
  initiativeEntriesAsDm: InitiativeEntry[];
  npcNotesAsDm: NpcNote[];
  stats: UserStats;
}
