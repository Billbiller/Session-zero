import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getCampaign } from "./campaigns";
import { CAMPAIGN_RATING_TAGS, type CampaignRating, type CampaignRatingSummary } from "./types";

export class CampaignRatingError extends Error {}

export { CAMPAIGN_RATING_TAGS };

const MAX_TAGS = 8;

interface CampaignRatingRow {
  id: string;
  campaign_id: string;
  rater_id: string;
  stars: number;
  tags: string;
  created_at: string;
  updated_at: string;
}

function rowToRating(row: CampaignRatingRow): CampaignRating {
  let tags: string[];
  try {
    const parsed = JSON.parse(row.tags);
    tags = Array.isArray(parsed) ? parsed : [];
  } catch {
    tags = [];
  }
  return { ...row, tags };
}

/** Only a current-or-former approved member can rate the campaign itself
 * -- not the DM (rating your own table isn't a signal worth aggregating,
 * and would be trivial to game), and not a stranger or a still-pending /
 * declined requester who never actually sat at the table. Unlike
 * lib/ratings.ts's roleInCampaign, a campaign rating has no "role" of its
 * own to return -- just an eligibility check. */
export function canRateCampaign(campaignId: string, userId: string): boolean {
  const campaign = getCampaign(campaignId);
  if (!campaign) return false;
  if (campaign.dm_id === userId) return false;
  const row = db
    .prepare(
      "SELECT 1 FROM memberships WHERE campaign_id = ? AND user_id = ? AND status IN ('approved','left')"
    )
    .get(campaignId, userId);
  return !!row;
}

export function getCampaignRating(campaignId: string, raterId: string): CampaignRating | null {
  const row = db
    .prepare("SELECT * FROM campaign_ratings WHERE campaign_id = ? AND rater_id = ?")
    .get(campaignId, raterId) as CampaignRatingRow | undefined;
  return row ? rowToRating(row) : null;
}

/** Rates the campaign as a whole -- one rating per (campaign, rater),
 * upserted, same revise-as-you-go convention as person-to-person ratings
 * (lib/ratings.ts's rateCampaignParticipant). */
export function rateCampaign(
  campaignId: string,
  raterId: string,
  input: { stars: number; tags?: string[] }
): CampaignRating {
  if (!canRateCampaign(campaignId, raterId)) {
    throw new CampaignRatingError(
      "Only players who joined this campaign can rate it -- not the DM, and not someone who never joined."
    );
  }
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
    throw new CampaignRatingError("Stars must be a whole number from 1 to 5.");
  }
  const tags = input.tags ?? [];
  if (tags.length > MAX_TAGS) {
    throw new CampaignRatingError(`You can select at most ${MAX_TAGS} tags.`);
  }
  for (const tag of tags) {
    if (!(CAMPAIGN_RATING_TAGS as readonly string[]).includes(tag)) {
      throw new CampaignRatingError(`"${tag}" isn't a valid campaign rating tag.`);
    }
  }

  const existing = getCampaignRating(campaignId, raterId);
  const now = new Date().toISOString();
  const rating: CampaignRating = {
    id: existing?.id ?? uuidv4(),
    campaign_id: campaignId,
    rater_id: raterId,
    stars: input.stars,
    tags,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO campaign_ratings (id, campaign_id, rater_id, stars, tags, created_at, updated_at)
     VALUES (@id, @campaign_id, @rater_id, @stars, @tags, @created_at, @updated_at)
     ON CONFLICT (campaign_id, rater_id) DO UPDATE SET
       stars = excluded.stars,
       tags = excluded.tags,
       updated_at = excluded.updated_at`
  ).run({ ...rating, tags: JSON.stringify(tags) });

  return rating;
}

/** The public aggregate for a campaign -- shown to everyone, including a
 * signed-out visitor deciding whether to join, same as the roster is
 * already public. A campaign with no ratings yet reports average: null,
 * not a zero score, matching lib/ratings.ts's per-user "unrated" convention. */
export function getCampaignRatingSummary(campaignId: string): CampaignRatingSummary {
  const rows = db
    .prepare("SELECT stars, tags FROM campaign_ratings WHERE campaign_id = ?")
    .all(campaignId) as { stars: number; tags: string }[];
  const tagCounts: Record<string, number> = {};
  let sum = 0;
  for (const row of rows) {
    sum += row.stars;
    let tags: string[];
    try {
      const parsed = JSON.parse(row.tags);
      tags = Array.isArray(parsed) ? parsed : [];
    } catch {
      tags = [];
    }
    for (const tag of tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }
  return {
    average: rows.length > 0 ? sum / rows.length : null,
    count: rows.length,
    tagCounts,
  };
}
