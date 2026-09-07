import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getCampaign } from "./campaigns";
import { notify } from "./notifications";
import { activePartyUserIds, hasPrivateAccess } from "./access";
import type { SessionLogEntry, SessionLogEntryWithKudos } from "./types";

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

function kudosCountFor(entryId: string): number {
  return (
    db.prepare("SELECT COUNT(*) as count FROM session_log_kudos WHERE entry_id = ?").get(entryId) as {
      count: number;
    }
  ).count;
}

/** Same list as listEntries(), enriched with each entry's kudos count and
 * whether the given viewer has already given kudos — the data the campaign
 * page's session log panel actually needs to render the tap-to-react
 * affordance. viewerId is null for a signed-out request (shouldn't happen
 * in practice since this list is only ever shown behind the private-access
 * gate, but keeps the function honest about its input). */
export function listEntriesWithKudos(
  campaignId: string,
  viewerId: string | null
): SessionLogEntryWithKudos[] {
  return listEntries(campaignId).map((entry) => ({
    ...entry,
    kudosCount: kudosCountFor(entry.id),
    viewerGaveKudos: viewerId
      ? !!db
          .prepare("SELECT 1 FROM session_log_kudos WHERE entry_id = ? AND user_id = ?")
          .get(entry.id, viewerId)
      : false,
  }));
}

/** Toggles the given user's kudos on an entry (on if they hadn't reacted,
 * off if they had) — a lightweight tap-to-react, not a stackable "like
 * count" a single person can inflate. Restricted to the DM or an active
 * member of the entry's campaign, the same boundary the session log itself
 * is already gated behind. Notifies the entry's author on a fresh kudos
 * (not on un-giving one, and never for kudos-ing your own entry). */
export function toggleKudos(entryId: string, userId: string): { count: number; given: boolean } {
  const entry = getEntry(entryId);
  if (!entry) throw new SessionLogError("Entry not found.");
  if (!hasPrivateAccess(userId, entry.campaign_id)) {
    throw new SessionLogError("Only the DM or an active member of this campaign can react to entries.");
  }

  const existing = db
    .prepare("SELECT id FROM session_log_kudos WHERE entry_id = ? AND user_id = ?")
    .get(entryId, userId) as { id: string } | undefined;

  let given: boolean;
  if (existing) {
    db.prepare("DELETE FROM session_log_kudos WHERE id = ?").run(existing.id);
    given = false;
  } else {
    db.prepare(
      "INSERT INTO session_log_kudos (id, entry_id, user_id, created_at) VALUES (?, ?, ?, ?)"
    ).run(uuidv4(), entryId, userId, new Date().toISOString());
    given = true;
    if (entry.author_id !== userId) {
      const campaign = getCampaign(entry.campaign_id);
      notify(
        entry.author_id,
        "session_log_kudos",
        entry.campaign_id,
        `Someone gave kudos to your session log entry${campaign ? ` in "${campaign.title}"` : ""}.`
      );
    }
  }

  return { count: kudosCountFor(entryId), given };
}
