import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getCampaign } from "./campaigns";
import { DM_RATING_TAGS, PLAYER_RATING_TAGS, type Rating, type RateeRole, type RatingSummary } from "./types";

export class RatingError extends Error {}

export { DM_RATING_TAGS, PLAYER_RATING_TAGS };

const MAX_TAGS = 8;

interface RatingRow {
  id: string;
  campaign_id: string;
  rater_id: string;
  ratee_id: string;
  ratee_role: RateeRole;
  stars: number;
  tags: string;
  created_at: string;
  updated_at: string;
}

function rowToRating(row: RatingRow): Rating {
  let tags: string[];
  try {
    const parsed = JSON.parse(row.tags);
    tags = Array.isArray(parsed) ? parsed : [];
  } catch {
    tags = [];
  }
  return { ...row, tags };
}

/**
 * "dm" if userId is this campaign's DM; "player" if they're a current or
 * former (approved-then-left) member — ratings are allowed after leaving,
 * since "how was your time in this campaign" doesn't stop being valid the
 * moment you leave. null if the user has no relationship to this campaign
 * at all (a stranger, or a still-pending/declined requester).
 */
function roleInCampaign(campaignId: string, userId: string): RateeRole | null {
  const campaign = getCampaign(campaignId);
  if (!campaign) return null;
  if (campaign.dm_id === userId) return "dm";
  const row = db
    .prepare(
      "SELECT 1 FROM memberships WHERE campaign_id = ? AND user_id = ? AND status IN ('approved','left')"
    )
    .get(campaignId, userId);
  return row ? "player" : null;
}

function tagsForRole(role: RateeRole): readonly string[] {
  return role === "dm" ? DM_RATING_TAGS : PLAYER_RATING_TAGS;
}

function validateStarsAndTags(stars: number, tags: string[], rateeRole: RateeRole) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new RatingError("Stars must be a whole number from 1 to 5.");
  }
  if (tags.length > MAX_TAGS) {
    throw new RatingError(`You can select at most ${MAX_TAGS} tags.`);
  }
  const allowed = tagsForRole(rateeRole);
  for (const tag of tags) {
    if (!(allowed as readonly string[]).includes(tag)) {
      throw new RatingError(`"${tag}" isn't a valid tag for rating a ${rateeRole === "dm" ? "DM" : "player"}.`);
    }
  }
}

/** Who the signed-in user (raterId) is eligible to rate in this campaign,
 * and any rating they've already given each — the data behind the
 * campaign-page ratings panel. Returns an empty list (not an error) if the
 * user has no relationship to the campaign, so callers can render nothing
 * rather than handle a special error case. */
export function ratingTargetsFor(
  campaignId: string,
  raterId: string
): { role: RateeRole | null; targets: { userId: string; existing: Rating | null }[] } {
  const raterRole = roleInCampaign(campaignId, raterId);
  if (!raterRole) return { role: null, targets: [] };

  const campaign = getCampaign(campaignId);
  if (!campaign) return { role: null, targets: [] };

  let candidateIds: string[];
  if (raterRole === "dm") {
    const rows = db
      .prepare(
        "SELECT DISTINCT user_id FROM memberships WHERE campaign_id = ? AND status IN ('approved','left')"
      )
      .all(campaignId) as { user_id: string }[];
    candidateIds = rows.map((r) => r.user_id);
  } else {
    candidateIds = [campaign.dm_id];
  }

  const targets = candidateIds
    .filter((id) => id !== raterId)
    .map((userId) => ({
      userId,
      existing: getRating(campaignId, raterId, userId),
    }));

  return { role: raterRole, targets };
}

export function getRating(campaignId: string, raterId: string, rateeId: string): Rating | null {
  const row = db
    .prepare(
      "SELECT * FROM ratings WHERE campaign_id = ? AND rater_id = ? AND ratee_id = ?"
    )
    .get(campaignId, raterId, rateeId) as RatingRow | undefined;
  return row ? rowToRating(row) : null;
}

/** Rates the DM (if raterId is a player) or a player (if raterId is the
 * DM) for this campaign — one rating per (campaign, rater, ratee) pair,
 * upserted, so a rating can be revised as a campaign goes on rather than
 * only allowed once. Rejects same-role pairs (a player can't rate another
 * player, nor themselves) since the backlog scope is specifically
 * DM<->player, not peer-to-peer. */
export function rateCampaignParticipant(
  campaignId: string,
  raterId: string,
  rateeId: string,
  input: { stars: number; tags?: string[] }
): Rating {
  if (raterId === rateeId) {
    throw new RatingError("You can't rate yourself.");
  }
  const raterRole = roleInCampaign(campaignId, raterId);
  if (!raterRole) {
    throw new RatingError("You're not part of this campaign.");
  }
  const rateeRole = roleInCampaign(campaignId, rateeId);
  if (!rateeRole) {
    throw new RatingError("That person isn't part of this campaign.");
  }
  if (raterRole === rateeRole) {
    throw new RatingError(
      "Ratings only go between the DM and a player — not between two players, or the DM and themselves."
    );
  }

  const tags = input.tags ?? [];
  validateStarsAndTags(input.stars, tags, rateeRole);

  const existing = getRating(campaignId, raterId, rateeId);
  const now = new Date().toISOString();
  const rating: Rating = {
    id: existing?.id ?? uuidv4(),
    campaign_id: campaignId,
    rater_id: raterId,
    ratee_id: rateeId,
    ratee_role: rateeRole,
    stars: input.stars,
    tags,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO ratings (id, campaign_id, rater_id, ratee_id, ratee_role, stars, tags, created_at, updated_at)
     VALUES (@id, @campaign_id, @rater_id, @ratee_id, @ratee_role, @stars, @tags, @created_at, @updated_at)
     ON CONFLICT (campaign_id, rater_id, ratee_id) DO UPDATE SET
       stars = excluded.stars,
       tags = excluded.tags,
       updated_at = excluded.updated_at`
  ).run({ ...rating, tags: JSON.stringify(tags) });

  return rating;
}

/** A user's aggregated reputation — split by the role they were rated in,
 * since "good DM" and "good player" are different signals. A user with no
 * ratings yet shows as unrated (average: null), not a zero score, so a
 * brand-new member isn't penalized for having no history. */
export function getUserRatingSummary(userId: string): RatingSummary {
  function summarize(role: RateeRole) {
    const rows = db
      .prepare("SELECT stars, tags FROM ratings WHERE ratee_id = ? AND ratee_role = ?")
      .all(userId, role) as { stars: number; tags: string }[];
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
  return { asDm: summarize("dm"), asPlayer: summarize("player") };
}
