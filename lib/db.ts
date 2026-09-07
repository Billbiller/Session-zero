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

export default db;
