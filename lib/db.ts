import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

function resolveDbPath(): string {
  const configured = process.env.SQLITE_DB_PATH;
  if (configured) return configured;
  return path.join(process.cwd(), "data", "session-zero.db");
}

const dbPath = resolveDbPath();
const dir = path.dirname(dbPath);
if (dir && dir !== ".") {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  dm_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  accepting_requests INTEGER NOT NULL DEFAULT 1,
  cancelled INTEGER NOT NULL DEFAULT 0,
  next_session_at TEXT,
  danger_level TEXT CHECK (danger_level IS NULL OR danger_level IN ('low-lethality','moderate','high-lethality','deadly-osr')),
  location TEXT NOT NULL DEFAULT '',
  -- Backlog #40: DM-set, player-visible flag echoing the prototype's "New
  -- player friendly" tag -- a heads-up filter in the same spirit as
  -- danger_level (a heads-up, not a scoreboard), not an authoritative
  -- rating of the table. See lib/types.ts's own doc comment on the
  -- Campaign type for the full framing.
  new_player_friendly INTEGER NOT NULL DEFAULT 0,
  -- Backlog #41 phase 1: structural in-person/remote/hybrid flag, distinct
  -- from the free-text location column above -- see lib/types.ts's
  -- SESSION_FORMATS doc comment for the full reasoning. Null (unset) is
  -- the default, same as danger_level.
  session_format TEXT CHECK (session_format IS NULL OR session_format IN ('in_person','remote','hybrid')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','declined','left')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memberships_campaign ON memberships(campaign_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  campaign_id TEXT REFERENCES campaigns(id),
  -- Backlog #31 (direct messaging): an optional second subject for a
  -- notification that isn't campaign-shaped -- e.g. "X sent you a
  -- message" links to /messages/<related_user_id>, not a campaign. Null
  -- for every notification type that predates this (they all link via
  -- campaign_id instead, or don't link anywhere).
  related_user_id TEXT REFERENCES users(id),
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  PRIMARY KEY (user_id, type)
);

CREATE TABLE IF NOT EXISTS session_log_entries (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_log_campaign ON session_log_entries(campaign_id);

CREATE TABLE IF NOT EXISTS session_log_kudos (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES session_log_entries(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (entry_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_session_log_kudos_entry ON session_log_kudos(entry_id);

CREATE TABLE IF NOT EXISTS party_notes (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),
  content TEXT NOT NULL DEFAULT '',
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  bio TEXT NOT NULL DEFAULT '',
  preferred_systems TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  -- Backlog #40: a "new to tabletop" self-flag, echoing the prototype's
  -- "New player friendly" tag from the other side of the table -- lets a
  -- brand-new player signal that on their own profile, distinct from
  -- campaigns.new_player_friendly (a DM's flag on their own campaign).
  new_to_tabletop INTEGER NOT NULL DEFAULT 0,
  -- Backlog #41 phase 1: a player's own in-person/remote/either preference,
  -- symmetric with campaigns.session_format above but a distinct, smaller
  -- enum (see lib/types.ts's SessionFormatPreference doc comment) since a
  -- preference isn't shaped like a table's actual format. Null (unset) is
  -- the default.
  session_format_preference TEXT CHECK (session_format_preference IS NULL OR session_format_preference IN ('in_person','remote','either')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  campaign_id TEXT REFERENCES campaigns(id),
  name TEXT NOT NULL,
  archetype TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  backstory TEXT NOT NULL DEFAULT '',
  avatar_emoji TEXT NOT NULL DEFAULT '🎲',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired','fallen')),
  epilogue TEXT NOT NULL DEFAULT '',
  portrait_data_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_campaign ON characters(campaign_id);

CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  rater_id TEXT NOT NULL REFERENCES users(id),
  ratee_id TEXT NOT NULL REFERENCES users(id),
  ratee_role TEXT NOT NULL CHECK (ratee_role IN ('dm','player')),
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (campaign_id, rater_id, ratee_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_id);
CREATE INDEX IF NOT EXISTS idx_ratings_campaign ON ratings(campaign_id);

-- Backlog #28: rating the campaign itself (not just DM/players) -- a
-- separate table from ratings rather than relaxing that table's
-- ratee_id (which REFERENCES users(id)) to sometimes point at a
-- campaigns.id instead. One rating per (campaign, rater), upsertable,
-- same convention as person-to-person ratings. Only a current-or-former
-- approved member may rate (not the DM, not a stranger) -- see
-- lib/campaignRatings.ts.
CREATE TABLE IF NOT EXISTS campaign_ratings (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  rater_id TEXT NOT NULL REFERENCES users(id),
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (campaign_id, rater_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_ratings_campaign ON campaign_ratings(campaign_id);

-- Phase 1 of backlog #27 (recurring weekly availability): a user marks
-- which day/time-of-day blocks they're generally free, as a structured
-- complement to profiles.availability's free text. day_of_week is 0=Monday
-- .. 6=Sunday, an app-level display-order index unrelated to
-- Date.prototype.getDay() (which is 0=Sunday) -- deliberately so, since
-- this is a recurring weekly pattern, not tied to any specific date. No
-- timezone is stored; treated as the user's own local week. The
-- search/matching layer that would compare two users' grids is explicitly
-- deferred to a later phase.
CREATE TABLE IF NOT EXISTS availability_slots (
  user_id TEXT NOT NULL REFERENCES users(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  block TEXT NOT NULL CHECK (block IN ('morning','afternoon','evening','night')),
  PRIMARY KEY (user_id, day_of_week, block)
);

-- Phase 1 of backlog #20 (substitute player workflow): a campaign member
-- posts "looking for a sub" for an upcoming session, and any signed-in
-- user can browse open requests app-wide and volunteer. Explicitly NOT
-- phase 2/3 -- there's no three-way approval state machine and no
-- temporary character-custody/guardrail enforcement yet. A request just
-- tracks open/filled/cancelled, and volunteering just expresses interest;
-- the requester or DM picks a volunteer manually and marks the request
-- filled outside this system for now.
CREATE TABLE IF NOT EXISTS sub_requests (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  requester_id TEXT NOT NULL REFERENCES users(id),
  -- Nullable: a request only enters the phase-2 approval workflow
  -- (owner/DM sign-off, temporary custody) when it names the specific
  -- character that needs a sub. A characterless request (e.g. "need
  -- help running NPCs") stays a phase-1-only request, marked
  -- filled/cancelled directly with no owner or custody to hand off.
  character_id TEXT REFERENCES characters(id),
  note TEXT NOT NULL DEFAULT '',
  -- Backlog #29: nullable ISO-8601 timestamp for the specific session this
  -- sub is needed for, mirroring campaigns.next_session_at -- see
  -- lib/schedule.ts's computeScheduleStatus(), reused as-is here to derive
  -- an upcoming/past-due status for this date too. Null means the
  -- requester didn't give a specific date/time (only the free-text note).
  needed_at TEXT,
  -- Backlog #29: a per-request override of the campaign's own location
  -- field. Null (the common case) means "use the campaign's location" --
  -- most campaigns already have one, and a sub only needs a different
  -- value for something like a one-off at a different table/venue than
  -- usual. Only set when the requester explicitly types an override.
  location TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_requests_campaign ON sub_requests(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sub_requests_status ON sub_requests(status);

CREATE TABLE IF NOT EXISTS sub_volunteers (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES sub_requests(id),
  volunteer_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (request_id, volunteer_id)
);

CREATE INDEX IF NOT EXISTS idx_sub_volunteers_request ON sub_volunteers(request_id);

-- Phase 2 of backlog #20: once a request (that names a character) has
-- volunteers, the requester or DM picks one to move forward as a
-- "placement". A placement needs both the character owner (always the
-- request's own requester, since a request can only name a character
-- the requester owns -- see lib/subRequests.ts) and the campaign's DM to
-- approve before it's "confirmed" and temporary custody transfers (see
-- characters.temp_pilot_user_id below). Per an explicit product decision
-- (2026-09-06), the rest of the active party is notified but is NOT a
-- blocking approval gate -- "the table" is informational only, not a
-- third vote, to keep this state machine bounded. Either approver can
-- decline, which ends the placement (the request stays open for a new
-- placement to be created); the requester/DM can also cancel a pending
-- placement outright (e.g. the volunteer backed out).
CREATE TABLE IF NOT EXISTS sub_placements (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES sub_requests(id),
  volunteer_id TEXT NOT NULL REFERENCES users(id),
  guardrails_note TEXT NOT NULL DEFAULT '',
  owner_approved INTEGER NOT NULL DEFAULT 0,
  dm_approved INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','declined','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_placements_request ON sub_placements(request_id);

-- Backlog #31: 1:1 direct messaging. A "conversation" is not its own
-- entity/row -- it's simply the unique unordered pair of
-- (sender_id, recipient_id) values across a user's messages, computed at
-- query time in lib/messages.ts rather than tracked as a separate table.
-- Any signed-in user may message any other signed-in user (matching this
-- app's existing openness -- campaign browsing, the sub-request pool,
-- etc. have no prerequisite-relationship gate either); see
-- lib/messages.ts for the full reasoning. "read" is from the recipient's
-- perspective only, same shape as notifications.read.
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES users(id),
  recipient_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- Backlog #32: table group chat -- a group thread per campaign's active
-- party, separate from 1:1 direct messages (backlog #31's own
-- pairwise messages table above) and separate from party_notes (a
-- persistent shared document, not a conversation history). Reuses the
-- same (sender, body, created_at) message shape as #31, scoped to a
-- campaign instead of a user pair. Access is the same hasPrivateAccess
-- boundary already gating party notes/session log (DM + approved
-- active members) -- see lib/campaignMessages.ts. Unlike messages.read
-- (per-recipient, per-message), a group thread's "have I read this"
-- state is naturally per-user-per-thread, not per-message -- see
-- campaign_message_reads below.
CREATE TABLE IF NOT EXISTS campaign_messages (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign ON campaign_messages(campaign_id);

-- One row per (campaign, user) tracking when that user last opened the
-- campaign's group chat. Used both to compute a per-user unread count
-- and to decide whether a fresh chat message should fire a notification
-- (see lib/campaignMessages.ts's sendCampaignMessage -- only the first
-- unread message since a user's last visit notifies them, not every
-- message, to avoid the noise a naive per-message fan-out would cause).
CREATE TABLE IF NOT EXISTS campaign_message_reads (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, user_id)
);

-- Backlog #33: DM dashboard basics -- initiative tracker. A per-campaign
-- ordered list of combatant entries the DM adds/reorders/removes during
-- a session. This is session-local *working* state, not a permanent
-- historical record -- like party_notes, it persists as "current state"
-- between requests/sessions until the DM explicitly clears it (there's
-- no automatic reset tied to a session boundary, since this app has no
-- discrete "session" entity to reset against). order_index is
-- maintained by the app itself via explicit move-up/move-down actions,
-- independent of the initiative value on each entry -- the DM decides
-- the actual running order by hand (useful for tie-breaking or
-- reflecting an on-the-fly reorder mid-combat); initiative is just a
-- number recorded on each entry, not an auto-sort key. hp is a free-text
-- field (e.g. "18/24") rather than a bare integer, matching how loosely
-- this app already treats similar "current status" free text elsewhere
-- (e.g. Character.epilogue) -- some tables track temp HP/conditions
-- inline as text rather than a bare number. DM-only access (see
-- lib/initiativeTracker.ts) -- a prep/running tool for the DM's eyes,
-- explicitly NOT shared with players, unlike party notes/session log.
CREATE TABLE IF NOT EXISTS initiative_entries (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL,
  initiative REAL NOT NULL,
  hp TEXT,
  notes TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_initiative_entries_campaign ON initiative_entries(campaign_id);

-- Backlog #33: DM dashboard basics -- NPC quick-notes. A lightweight
-- per-campaign list of NPC name + free-text notes -- the exact
-- name+notes-pair shape the backlog line itself called for, rather than
-- inventing a separate "quick notes" concept on top of it. DM-only
-- access (see lib/npcNotes.ts), same "prep tool, not party-visible"
-- reasoning as initiative_entries above.
CREATE TABLE IF NOT EXISTS npc_notes (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_npc_notes_campaign ON npc_notes(campaign_id);

-- Backlog #34, phase 1: resource vault -- per-campaign uploads (maps,
-- handouts, homebrew notes). Follows the same base64-data:-URL-in-SQLite
-- pattern already established for character portraits (#26), but with a
-- broader allowed file-type set (images, PDF, and plain text -- not just
-- images) and a larger size cap justified in lib/campaignResources.ts.
-- Visible to the campaign's active party -- hasPrivateAccess (DM +
-- approved active members), the same boundary already gating party
-- notes/session log/table chat, since a DM's homebrew prep isn't meant
-- to be public. Phase 2 (a cross-community library browsable by system)
-- is explicitly out of scope here -- see the backlog entry and
-- claude/progress.md for the reasoning.
CREATE TABLE IF NOT EXISTS campaign_resources (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  uploader_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL,
  data_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_resources_campaign ON campaign_resources(campaign_id);

-- Backlog #35: session RSVP + reminders. A member's confirm/decline for
-- the campaign's *current* next_session_at value -- there is no session_at
-- column here on purpose. An RSVP has no independent identity of its own
-- once the scheduled date it was answering has changed, so a reschedule
-- clears every row for the campaign (see lib/schedule.ts's updateSchedule)
-- rather than leaving stale answers attached to a date that no longer
-- means anything. One row per (campaign, user); no row = no response yet.
-- Access is the same hasPrivateAccess boundary as party notes/schedule/
-- chat (DM + approved active members) -- see lib/sessionRsvps.ts.
CREATE TABLE IF NOT EXISTS session_rsvps (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  response TEXT NOT NULL CHECK (response IN ('confirmed','declined')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, user_id)
);

-- Backlog #35: tracks which (campaign, user, next_session_at value)
-- combinations have already had a session_reminder notification fired,
-- so the lazy check-on-activity trigger (see lib/sessionReminders.ts)
-- never sends a duplicate for the same scheduled date. Keyed by
-- session_at itself rather than relying on a reset-on-reschedule like
-- session_rsvps above -- a reschedule naturally produces a new
-- session_at value, so old rows for a since-changed date simply stop
-- matching rather than needing to be cleared; they're left in place as
-- a harmless audit trail (dead rows can't cause a duplicate reminder
-- for the *current* date).
CREATE TABLE IF NOT EXISTS session_reminders_sent (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  session_at TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, user_id, session_at)
);

-- Backlog #37: lightweight community discussion boards -- the concrete
-- first slice of backlog #25 (clubs/curated community lists). A fixed,
-- curated set of topic boards (board_slug, constrained by CHECK to the
-- app-level BOARD_TOPICS const in lib/types.ts -- there is no user-created
-- board), not campaign-scoped. Browsing is public; posting requires
-- sign-in (see lib/boards.ts). "Light moderation" for this pass means
-- self-moderation only -- a thread/reply's own author can delete it, with
-- no admin/reporting system yet.
CREATE TABLE IF NOT EXISTS board_threads (
  id TEXT PRIMARY KEY,
  board_slug TEXT NOT NULL CHECK (board_slug IN ('new-player-questions','homebrew-showcase','lfg-advice','local-meetups')),
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_board_threads_board ON board_threads(board_slug);

-- Flat replies -- a reply always belongs to a thread directly, never to
-- another reply (no nesting, matching backlog #37's own "keep it simple"
-- framing).
CREATE TABLE IF NOT EXISTS board_replies (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES board_threads(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_board_replies_thread ON board_replies(thread_id);

-- Backlog #38: opt-in following + a lightweight public activity feed.
-- Judgment call on who can follow whom (the backlog line's own text says
-- "players/DMs you've actually played with"): any signed-in user may
-- follow any other signed-in user, with NO shared-campaign-membership
-- gate enforced -- matching the exact same openness precedent already
-- established for direct messaging (backlog #31, see lib/messages.ts's
-- own doc comment) and for starting a board thread/volunteering for a
-- sub (#37/#20), rather than inventing a new "you must have actually
-- played together" restriction unique to this one relationship. The
-- backlog phrase describes the *expected* use case (you follow people
-- from your own tables), not a hard technical gate this app enforces
-- anywhere else for a comparable relationship -- and a real gate would
-- need to walk shared (including past 'left') campaign membership for
-- privacy benefit that doesn't actually exist here, since everything a
-- followed user's feed events surface is already fully public on their
-- own /players/[id] page regardless of who follows them. See
-- lib/follows.ts and claude/progress.md's dated session log entry for
-- the full reasoning.
CREATE TABLE IF NOT EXISTS follows (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL REFERENCES users(id),
  followed_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (follower_id, followed_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id);

-- The feed itself: a small, explicit event log written at the exact
-- moment a feed-worthy event happens (see lib/feed.ts's recordX
-- functions, called from lib/characters.ts/lib/memberships.ts/
-- lib/campaignRatings.ts), not derived after the fact by scanning
-- mutable rows -- a character's updated_at bumps on every edit, not
-- just a status change, so it can't double as a reliable "this is when
-- the status changed" timestamp the way an immutable per-entry table
-- like session_log_entries can be read directly.
--
-- CRITICAL PRIVACY BOUNDARY, read before adding a new event type here:
-- every event type this table can hold surfaces something that is
-- ALREADY fully public elsewhere in this app today -- a character's
-- existence/status on its owner's public /players/[id] page, or a
-- campaign's accepting_requests/rating aggregate on its own public
-- detail page. Session log entries, party notes, table chat, and DM-
-- only tools (initiative tracker/NPC notes) are deliberately never
-- written here, because those are gated behind hasPrivateAccess()/
-- isDm() (lib/access.ts) and NOT visible to a non-member follower --
-- surfacing them in a feed would leak private campaign content past an
-- author's actual audience just because they have followers, which is
-- a real regression against this app's own tested private-side
-- boundary, not a feature. This table is a browsing *view* over
-- already-public facts, never a new kind of content or a bypass of an
-- existing access check.
CREATE TABLE IF NOT EXISTS feed_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('character_created','character_status_changed','campaign_became_full','campaign_first_rated')),
  campaign_id TEXT REFERENCES campaigns(id),
  character_id TEXT REFERENCES characters(id),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feed_events_actor ON feed_events(actor_id);

-- Backlog #39: attendance-based reliability signal. Deliberately NOT
-- derived from session_rsvps (backlog #35) -- an RSVP is intent to
-- attend the *next* session, not a record that someone actually showed
-- up, and isn't even durable history: every row for a campaign is wiped
-- the moment next_session_at changes (see this file's session_rsvps
-- comment above), so there is no persisted RSVP trail left to mine after
-- the fact anyway. The only durable per-session record this app has is a
-- session_log_entries row, so honest attendance hangs off that instead:
-- the DM optionally marks, per log entry, which of the campaign's
-- currently-active non-DM party members actually showed up. No row for
-- a (entry, user) pair means "not recorded" -- never "recorded absent"
-- -- so an entry the DM never marks attendance for doesn't silently
-- count against anyone. See lib/attendance.ts for the full design and
-- claude/progress.md for the data-honesty reasoning behind this over a
-- "derive it from RSVP data" proxy.
CREATE TABLE IF NOT EXISTS session_log_attendance (
  entry_id TEXT NOT NULL REFERENCES session_log_entries(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  attended INTEGER NOT NULL CHECK (attended IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_session_log_attendance_entry ON session_log_attendance(entry_id);
CREATE INDEX IF NOT EXISTS idx_session_log_attendance_user ON session_log_attendance(user_id);
`);

// Lightweight migration for databases created before password_hash existed
// (placeholder-auth era). New databases already get the column from the
// CREATE TABLE above, so this is a no-op for them.
const userColumns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
if (!userColumns.some((c) => c.name === "password_hash")) {
  db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
}

// Lightweight migrations for databases created before character legacies
// (status/epilogue) and campaign danger levels existed (backlog #19). New
// databases already get these columns from the CREATE TABLE statements
// above, so this is a no-op for them. SQLite can't add a CHECK constraint
// via ALTER TABLE ADD COLUMN, so these two columns are left unconstrained
// at the schema level for migrated databases — validation still happens in
// lib/characters.ts and lib/campaigns.ts before any write.
const characterColumns = db.prepare("PRAGMA table_info(characters)").all() as { name: string }[];
if (!characterColumns.some((c) => c.name === "status")) {
  db.exec("ALTER TABLE characters ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}
if (!characterColumns.some((c) => c.name === "epilogue")) {
  db.exec("ALTER TABLE characters ADD COLUMN epilogue TEXT NOT NULL DEFAULT ''");
}
const campaignColumns = db.prepare("PRAGMA table_info(campaigns)").all() as { name: string }[];
if (!campaignColumns.some((c) => c.name === "danger_level")) {
  db.exec("ALTER TABLE campaigns ADD COLUMN danger_level TEXT");
}

// Lightweight migration for databases created before coarse location fields
// existed (backlog #22). New databases already get these from the CREATE
// TABLE statements above.
if (!campaignColumns.some((c) => c.name === "location")) {
  db.exec("ALTER TABLE campaigns ADD COLUMN location TEXT NOT NULL DEFAULT ''");
}
const profileColumns = db.prepare("PRAGMA table_info(profiles)").all() as { name: string }[];
if (!profileColumns.some((c) => c.name === "location")) {
  db.exec("ALTER TABLE profiles ADD COLUMN location TEXT NOT NULL DEFAULT ''");
}

// Lightweight migration for databases created before character portrait
// uploads existed (backlog #26). New databases already get this column
// from the CREATE TABLE statement above. Nullable — a character with no
// uploaded portrait falls back to its curated avatar_emoji. Reuses the
// characterColumns snapshot taken above (captured before any ALTER TABLE
// in this file runs, so it correctly never contains this column either).
if (!characterColumns.some((c) => c.name === "portrait_data_url")) {
  db.exec("ALTER TABLE characters ADD COLUMN portrait_data_url TEXT");
}

// Lightweight migrations for databases created before the phase-2 sub
// workflow existed (backlog #20 phase 2). New databases already get these
// columns from the CREATE TABLE statements above. temp_pilot_user_id is a
// pure display marker ("currently piloted by X for a session") set when a
// placement is confirmed and cleared by an explicit "end sub" action --
// this app has no session-duration tracking to clear it automatically.
if (!characterColumns.some((c) => c.name === "temp_pilot_user_id")) {
  db.exec("ALTER TABLE characters ADD COLUMN temp_pilot_user_id TEXT");
}
const subRequestColumns = db.prepare("PRAGMA table_info(sub_requests)").all() as { name: string }[];
if (!subRequestColumns.some((c) => c.name === "character_id")) {
  db.exec("ALTER TABLE sub_requests ADD COLUMN character_id TEXT");
}

// Lightweight migration for databases created before direct messaging
// existed (backlog #31). New databases already get this column from the
// CREATE TABLE statement above.
const notificationColumns = db.prepare("PRAGMA table_info(notifications)").all() as { name: string }[];
if (!notificationColumns.some((c) => c.name === "related_user_id")) {
  db.exec("ALTER TABLE notifications ADD COLUMN related_user_id TEXT");
}

// Lightweight migrations for databases created before new-player
// onboarding existed (backlog #40). New databases already get these
// columns from the CREATE TABLE statements above.
if (!campaignColumns.some((c) => c.name === "new_player_friendly")) {
  db.exec("ALTER TABLE campaigns ADD COLUMN new_player_friendly INTEGER NOT NULL DEFAULT 0");
}
if (!profileColumns.some((c) => c.name === "new_to_tabletop")) {
  db.exec("ALTER TABLE profiles ADD COLUMN new_to_tabletop INTEGER NOT NULL DEFAULT 0");
}

// Lightweight migrations for databases created before structural
// in-person/remote/hybrid discovery existed (backlog #41 phase 1). New
// databases already get these columns from the CREATE TABLE statements
// above. SQLite can't add a CHECK constraint via ALTER TABLE ADD COLUMN,
// so these are left unconstrained at the schema level for migrated
// databases -- same caveat as danger_level above; validation still
// happens in lib/campaigns.ts/lib/profiles.ts before any write.
if (!campaignColumns.some((c) => c.name === "session_format")) {
  db.exec("ALTER TABLE campaigns ADD COLUMN session_format TEXT");
}
if (!profileColumns.some((c) => c.name === "session_format_preference")) {
  db.exec("ALTER TABLE profiles ADD COLUMN session_format_preference TEXT");
}

// Lightweight migrations for databases created before sub requests carried
// a specific date/time and location (backlog #29). New databases already
// get these columns from the CREATE TABLE statement above. Reuses the
// subRequestColumns snapshot taken above (captured before any ALTER TABLE
// on this table ran, so it correctly never contains these columns either).
if (!subRequestColumns.some((c) => c.name === "needed_at")) {
  db.exec("ALTER TABLE sub_requests ADD COLUMN needed_at TEXT");
}
if (!subRequestColumns.some((c) => c.name === "location")) {
  db.exec("ALTER TABLE sub_requests ADD COLUMN location TEXT");
}

export default db;
