import db from "./db";
import { getCampaign } from "./campaigns";

/**
 * A user has access to a campaign's private side (session log, party notes,
 * schedule) if they're the DM, or if they have an *approved and still active*
 * membership. Pending requesters, declined/left members, and strangers all
 * get false.
 */
export function hasPrivateAccess(userId: string | null, campaignId: string): boolean {
  if (!userId) return false;
  const campaign = getCampaign(campaignId);
  if (!campaign) return false;
  if (campaign.dm_id === userId) return true;
  const row = db
    .prepare(
      "SELECT 1 FROM memberships WHERE campaign_id = ? AND user_id = ? AND status = 'approved'"
    )
    .get(campaignId, userId);
  return !!row;
}

/** Backlog #33 (initiative tracker, NPC quick-notes): a narrower
 * boundary than hasPrivateAccess -- these two DM-dashboard tools are
 * explicitly DM-only prep/running tools, not shared with the rest of
 * the party the way session log/party notes/schedule are. Kept as its
 * own small predicate (rather than inline `campaign.dm_id === userId`
 * checks scattered across lib/initiativeTracker.ts and lib/npcNotes.ts)
 * so the "who can see this" boundary is named and testable in one
 * place, mirroring how hasPrivateAccess itself works for the wider
 * private-side boundary. */
export function isDm(userId: string | null, campaignId: string): boolean {
  if (!userId) return false;
  const campaign = getCampaign(campaignId);
  if (!campaign) return false;
  return campaign.dm_id === userId;
}

/** DM + every approved/active member, used for fanning notifications out to "the party". */
export function activePartyUserIds(campaignId: string): string[] {
  const campaign = getCampaign(campaignId);
  if (!campaign) return [];
  const members = db
    .prepare(
      "SELECT user_id FROM memberships WHERE campaign_id = ? AND status = 'approved'"
    )
    .all(campaignId) as { user_id: string }[];
  const ids = new Set(members.map((m) => m.user_id));
  ids.add(campaign.dm_id);
  return Array.from(ids);
}
