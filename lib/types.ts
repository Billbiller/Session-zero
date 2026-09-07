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
  created_at: string;
  updated_at: string;
}

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
  updated_at: string | null;
}

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

export const AVAILABILITY_BLOCKS = ["morning", "afternoon", "evening", "night"] as const;

export type AvailabilityBlock = (typeof AVAILABILITY_BLOCKS)[number];

export interface AvailabilitySlot {
  /** 0-6, see AVAILABILITY_DAYS. */
  day: number;
  block: AvailabilityBlock;
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
  requesterName: string;
  characterName: string | null;
  volunteerCount: number;
  viewerHasVolunteered: boolean;
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
  created_at: string;
  updated_at: string;
}

export interface RatingSummary {
  asDm: { average: number | null; count: number; tagCounts: Record<string, number> };
  asPlayer: { average: number | null; count: number; tagCounts: Record<string, number> };
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

