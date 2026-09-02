import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getCampaign } from "./campaigns";
import { notify } from "./notifications";
import { activePartyUserIds } from "./access";
import type { SessionLogEntry } from "./types";

export class SessionLogError extends Error {}

export function listEntries(campaignId: string): SessionLogEntry[] {
  return db
    .prepare(
      "SELECT * FROM session_log_entries WHERE campaign_id = ? ORDER BY created_at DESC, rowid DESC"
    )
    .all(campaignId) as SessionLogEntry[];
}

export function createEntry(
  campaignId: string,
  authorId: string,
  content: string
): SessionLogEntry {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new SessionLogError("Campaign not found.");
  if (campaign.dm_id !== authorId) {
    throw new SessionLogError("Only the DM can post to the session log.");
  }
  const now = new Date().toISOString();
  const entry: SessionLogEntry = {
    id: uuidv4(),
    campaign_id: campaignId,
    author_id: authorId,
    content: content.trim(),
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO session_log_entries (id, campaign_id, author_id, content, created_at, updated_at)
     VALUES (@id, @campaign_id, @author_id, @content, @created_at, @updated_at)`
  ).run(entry);

  const others = activePartyUserIds(campaignId).filter((id) => id !== authorId);
  for (const userId of others) {
    notify(
      userId,
      "session_log_posted",
      campaignId,
      `A new session log entry was posted for "${campaign.title}".`
    );
  }
  return entry;
}

function getEntry(entryId: string): SessionLogEntry | null {
  const row = db
    .prepare("SELECT * FROM session_log_entries WHERE id = ?")
    .get(entryId) as SessionLogEntry | undefined;
  return row ?? null;
}

export function updateEntry(
  entryId: string,
  dmId: string,
  content: string
): SessionLogEntry {
  const entry = getEntry(entryId);
  if (!entry) throw new SessionLogError("Entry not found.");
  const campaign = getCampaign(entry.campaign_id);
  if (!campaign || campaign.dm_id !== dmId) {
    throw new SessionLogError("Only the DM can edit this entry.");
  }
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE session_log_entries SET content = ?, updated_at = ? WHERE id = ?"
  ).run(content.trim(), now, entryId);
  return getEntry(entryId) as SessionLogEntry;
}

export function deleteEntry(entryId: string, dmId: string): void {
  const entry = getEntry(entryId);
  if (!entry) throw new SessionLogError("Entry not found.");
  const campaign = getCampaign(entry.campaign_id);
  if (!campaign || campaign.dm_id !== dmId) {
    throw new SessionLogError("Only the DM can delete this entry.");
  }
  db.prepare("DELETE FROM session_log_entries WHERE id = ?").run(entryId);
}
