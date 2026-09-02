import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getCampaign, approvedHeadcount, CampaignError } from "./campaigns";
import { notify } from "./notifications";
import { activePartyUserIds } from "./access";
import type { Membership } from "./types";

export class MembershipError extends Error {}

function activeMembership(campaignId: string, userId: string): Membership | null {
  const row = db
    .prepare(
      `SELECT * FROM memberships WHERE campaign_id = ? AND user_id = ?
       AND status IN ('pending','approved') ORDER BY created_at DESC LIMIT 1`
    )
    .get(campaignId, userId) as Membership | undefined;
  return row ?? null;
}

export function requestJoin(campaignId: string, userId: string): Membership {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new MembershipError("Campaign not found.");
  if (campaign.cancelled) throw new MembershipError("This campaign is cancelled.");
  if (campaign.dm_id === userId) {
    throw new MembershipError("You can't request to join your own campaign.");
  }
  if (!campaign.accepting_requests) {
    throw new MembershipError("This campaign isn't accepting requests right now.");
  }
  if (activeMembership(campaignId, userId)) {
    throw new MembershipError("You already have an active request for this campaign.");
  }
  const now = new Date().toISOString();
  const membership: Membership = {
    id: uuidv4(),
    campaign_id: campaignId,
    user_id: userId,
    status: "pending",
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO memberships (id, campaign_id, user_id, status, created_at, updated_at)
     VALUES (@id, @campaign_id, @user_id, @status, @created_at, @updated_at)`
  ).run(membership);
  notify(campaign.dm_id, "join_requested", campaignId, "A player has requested to join your campaign.");
  return membership;
}

function getMembership(id: string): Membership | null {
  const row = db.prepare("SELECT * FROM memberships WHERE id = ?").get(id) as
    | Membership
    | undefined;
  return row ?? null;
}

export function approveRequest(membershipId: string, dmId: string): Membership {
  const membership = getMembership(membershipId);
  if (!membership) throw new MembershipError("Request not found.");
  const campaign = getCampaign(membership.campaign_id);
  if (!campaign) throw new MembershipError("Campaign not found.");
  if (campaign.dm_id !== dmId) {
    throw new MembershipError("Only the DM can approve requests.");
  }
  if (membership.status !== "pending") {
    throw new MembershipError("This request has already been resolved.");
  }
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE memberships SET status = 'approved', updated_at = ? WHERE id = ?"
  ).run(now, membershipId);

  const newCount = approvedHeadcount(membership.campaign_id);
  if (newCount >= campaign.capacity) {
    db.prepare(
      "UPDATE campaigns SET accepting_requests = 0, updated_at = ? WHERE id = ?"
    ).run(now, campaign.id);
  }

  notify(
    membership.user_id,
    "join_approved",
    campaign.id,
    `You're in! Your request to join "${campaign.title}" was approved.`
  );
  return getMembership(membershipId) as Membership;
}

export function declineRequest(membershipId: string, dmId: string): Membership {
  const membership = getMembership(membershipId);
  if (!membership) throw new MembershipError("Request not found.");
  const campaign = getCampaign(membership.campaign_id);
  if (!campaign) throw new MembershipError("Campaign not found.");
  if (campaign.dm_id !== dmId) {
    throw new MembershipError("Only the DM can decline requests.");
  }
  if (membership.status !== "pending") {
    throw new MembershipError("This request has already been resolved.");
  }
  db.prepare(
    "UPDATE memberships SET status = 'declined', updated_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), membershipId);

  notify(
    membership.user_id,
    "join_declined",
    campaign.id,
    `Your request to join "${campaign.title}" was declined.`
  );
  return getMembership(membershipId) as Membership;
}

export function leaveCampaign(campaignId: string, userId: string): void {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new MembershipError("Campaign not found.");
  if (campaign.dm_id === userId) {
    throw new MembershipError("The DM can't leave their own campaign.");
  }
  const membership = db
    .prepare(
      "SELECT * FROM memberships WHERE campaign_id = ? AND user_id = ? AND status = 'approved'"
    )
    .get(campaignId, userId) as Membership | undefined;
  if (!membership) {
    throw new MembershipError("You're not an active member of this campaign.");
  }
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE memberships SET status = 'left', updated_at = ? WHERE id = ?"
  ).run(now, membership.id);

  const newCount = approvedHeadcount(campaignId);
  if (newCount < campaign.capacity && !campaign.accepting_requests) {
    db.prepare(
      "UPDATE campaigns SET accepting_requests = 1, updated_at = ? WHERE id = ?"
    ).run(now, campaignId);
  }

  notify(
    campaign.dm_id,
    "member_left_dm",
    campaignId,
    `A player has left "${campaign.title}".`
  );

  const others = activePartyUserIds(campaignId).filter(
    (id) => id !== userId && id !== campaign.dm_id
  );
  for (const otherId of others) {
    notify(
      otherId,
      "member_left_party",
      campaignId,
      `A fellow party member has left "${campaign.title}".`
    );
  }
}

export function listRequests(
  campaignId: string,
  status?: "pending" | "approved" | "declined" | "left"
): Membership[] {
  if (status) {
    return db
      .prepare(
        "SELECT * FROM memberships WHERE campaign_id = ? AND status = ? ORDER BY created_at ASC"
      )
      .all(campaignId, status) as Membership[];
  }
  return db
    .prepare("SELECT * FROM memberships WHERE campaign_id = ? ORDER BY created_at ASC")
    .all(campaignId) as Membership[];
}

export { CampaignError };
