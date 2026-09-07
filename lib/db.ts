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

export default db;
