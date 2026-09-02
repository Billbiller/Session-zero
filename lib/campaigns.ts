import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { notify } from "./notifications";
import type { Campaign } from "./types";

export class CampaignError extends Error {}

export function approvedHeadcount(campaignId: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM memberships WHERE campaign_id = ? AND status = 'approved'"
    )
    .get(campaignId) as { count: number };
  return row.count;
}

export function createCampaign(input: {
  dmId: string;
  title: string;
  description: string;
  system: string;
  capacity: number;
}): Campaign {
  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    throw new CampaignError("Capacity must be a positive integer.");
  }
  const now = new Date().toISOString();
  const campaign: Campaign = {
    id: uuidv4(),
    dm_id: input.dmId,
    title: input.title.trim(),
    description: input.description.trim(),
    system: input.system.trim(),
    capacity: input.capacity,
    accepting_requests: 1,
    cancelled: 0,
    next_session_at: null,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO campaigns
      (id, dm_id, title, description, system, capacity, accepting_requests, cancelled, next_session_at, created_at, updated_at)
     VALUES
      (@id, @dm_id, @title, @description, @system, @capacity, @accepting_requests, @cancelled, @next_session_at, @created_at, @updated_at)`
  ).run(campaign);
  return campaign;
}

export function getCampaign(id: string): Campaign | null {
  const row = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as
    | Campaign
    | undefined;
  return row ?? null;
}

export function updateCampaign(
  id: string,
  dmId: string,
  updates: Partial<{
    title: string;
    description: string;
    system: string;
    capacity: number;
  }>
): Campaign {
  const campaign = getCampaign(id);
  if (!campaign) throw new CampaignError("Campaign not found.");
  if (campaign.dm_id !== dmId) {
    throw new CampaignError("Only the DM can edit this campaign.");
  }
  if (updates.capacity !== undefined) {
    if (!Number.isInteger(updates.capacity) || updates.capacity < 1) {
      throw new CampaignError("Capacity must be a positive integer.");
    }
    const current = approvedHeadcount(id);
    if (updates.capacity < current) {
      throw new CampaignError(
        `Capacity can't be dropped below the current approved headcount (${current}).`
      );
    }
  }
  const next: Campaign = {
    ...campaign,
    title: updates.title !== undefined ? updates.title.trim() : campaign.title,
    description:
      updates.description !== undefined
        ? updates.description.trim()
        : campaign.description,
    system: updates.system !== undefined ? updates.system.trim() : campaign.system,
    capacity: updates.capacity ?? campaign.capacity,
    updated_at: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE campaigns SET title=@title, description=@description, system=@system,
     capacity=@capacity, updated_at=@updated_at WHERE id=@id`
  ).run(next);
  return next;
}

export function setCancelled(
  id: string,
  dmId: string,
  cancelled: boolean
): Campaign {
  const campaign = getCampaign(id);
  if (!campaign) throw new CampaignError("Campaign not found.");
  if (campaign.dm_id !== dmId) {
    throw new CampaignError("Only the DM can cancel this campaign.");
  }
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE campaigns SET cancelled = ?, updated_at = ? WHERE id = ?"
  ).run(cancelled ? 1 : 0, now, id);

  if (cancelled) {
    const activeMembers = db
      .prepare(
        "SELECT user_id FROM memberships WHERE campaign_id = ? AND status = 'approved'"
      )
      .all(id) as { user_id: string }[];
    for (const m of activeMembers) {
      notify(
        m.user_id,
        "campaign_cancelled",
        id,
        `"${campaign.title}" has been cancelled.`
      );
    }
  }
  return getCampaign(id) as Campaign;
}

export function manualReopen(id: string, dmId: string): Campaign {
  const campaign = getCampaign(id);
  if (!campaign) throw new CampaignError("Campaign not found.");
  if (campaign.dm_id !== dmId) {
    throw new CampaignError("Only the DM can reopen this campaign.");
  }
  db.prepare(
    "UPDATE campaigns SET accepting_requests = 1, updated_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), id);
  return getCampaign(id) as Campaign;
}

export type CampaignSort = "newest" | "oldest" | "title";

export function listCampaigns(opts: {
  system?: string;
  sort?: CampaignSort;
  page?: number;
  pageSize?: number;
  includeCancelled?: boolean;
} = {}): { items: Campaign[]; total: number } {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 10;
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.system) {
    where.push("system = @system");
    params.system = opts.system;
  }
  if (!opts.includeCancelled) {
    where.push("cancelled = 0");
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderBy =
    opts.sort === "oldest"
      ? "created_at ASC, rowid ASC"
      : opts.sort === "title"
        ? "title ASC, rowid ASC"
        : "created_at DESC, rowid DESC";

  const total = (
    db
      .prepare(`SELECT COUNT(*) as count FROM campaigns ${whereClause}`)
      .get(params) as { count: number }
  ).count;

  const items = db
    .prepare(
      `SELECT * FROM campaigns ${whereClause} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as Campaign[];

  return { items, total };
}
