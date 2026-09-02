import db from "./db";
import { getCampaign } from "./campaigns";
import { hasPrivateAccess, activePartyUserIds } from "./access";
import { notify } from "./notifications";
import type { PartyNotes } from "./types";

export class PartyNotesError extends Error {}

export function getNotes(campaignId: string): PartyNotes {
  const row = db
    .prepare("SELECT * FROM party_notes WHERE campaign_id = ?")
    .get(campaignId) as PartyNotes | undefined;
  return (
    row ?? {
      campaign_id: campaignId,
      content: "",
      updated_by: null,
      updated_at: null,
    }
  );
}

/** Editable by the DM and active (approved) members — a deliberate judgment call. */
export function updateNotes(
  campaignId: string,
  userId: string,
  content: string
): PartyNotes {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new PartyNotesError("Campaign not found.");
  if (!hasPrivateAccess(userId, campaignId)) {
    throw new PartyNotesError("You don't have access to this campaign's notes.");
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO party_notes (campaign_id, content, updated_by, updated_at)
     VALUES (@campaign_id, @content, @updated_by, @updated_at)
     ON CONFLICT (campaign_id) DO UPDATE SET
       content = excluded.content, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  ).run({
    campaign_id: campaignId,
    content,
    updated_by: userId,
    updated_at: now,
  });

  const others = activePartyUserIds(campaignId).filter((id) => id !== userId);
  for (const otherId of others) {
    notify(
      otherId,
      "party_notes_updated",
      campaignId,
      `The shared party notes for "${campaign.title}" were updated.`
    );
  }
  return getNotes(campaignId);
}
