import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getUserById } from "./auth";
import type {
  FeedEvent,
  FeedEventWithActor,
  FeedEventType,
  Character,
  Campaign,
} from "./types";

export class FeedError extends Error {}

/** Single choke point for writing a feed event -- mirrors
 * lib/notifications.ts's notify() being the one place every notification
 * fan-out path goes through. Every call site below is the exact moment a
 * feed-worthy event happens, not a query derived after the fact from a
 * mutable row (see lib/db.ts's feed_events table comment for why). */
function recordEvent(
  actorId: string,
  type: FeedEventType,
  message: string,
  opts: { campaignId?: string | null; characterId?: string | null } = {}
): FeedEvent {
  const event: FeedEvent = {
    id: uuidv4(),
    actor_id: actorId,
    type,
    campaign_id: opts.campaignId ?? null,
    character_id: opts.characterId ?? null,
    message,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO feed_events (id, actor_id, type, campaign_id, character_id, message, created_at)
     VALUES (@id, @actor_id, @type, @campaign_id, @character_id, @message, @created_at)`
  ).run(event);
  return event;
}

/** Called from lib/characters.ts's createCharacter -- a brand-new
 * character is already public on its owner's /players/[id] page the
 * moment it's created, so surfacing "created a new character" is not
 * exposing anything new, just a different place to notice it. */
export function recordCharacterCreated(actorId: string, character: Character): void {
  recordEvent(actorId, "character_created", `created a new character, ${character.name}.`, {
    characterId: character.id,
    campaignId: character.campaign_id,
  });
}

/** Called from lib/characters.ts's updateCharacter, only when status
 * actually transitions into "retired" or "fallen" (not on every edit,
 * and not on a transition back to "active") -- see the call site's own
 * comment for the exact transition check. This is the character-legacy
 * "milestone" the backlog line's own text calls out. */
export function recordCharacterStatusChanged(actorId: string, character: Character): void {
  const verb = character.status === "fallen" ? "has fallen" : "has retired";
  recordEvent(actorId, "character_status_changed", `${character.name} ${verb}.`, {
    characterId: character.id,
    campaignId: character.campaign_id,
  });
}

/** Called from lib/memberships.ts's approveRequest, only on the actual
 * open -> full transition (not every time a campaign happens to already
 * be full) -- a campaign's accepting_requests state is already visible
 * to everyone on /campaigns and the campaign's own detail page, so this
 * is a notable public status change for a DM's followers to notice, not
 * new information. */
export function recordCampaignBecameFull(dmId: string, campaign: Campaign): void {
  recordEvent(dmId, "campaign_became_full", `"${campaign.title}" filled up.`, {
    campaignId: campaign.id,
  });
}

/** Called from lib/campaignRatings.ts's rateCampaign, only the very
 * first time a campaign receives a public rating (not on every
 * individual rating, which would be noisy) -- the campaign's rating
 * aggregate is already public on its own detail page. */
export function recordCampaignFirstRated(dmId: string, campaign: Campaign): void {
  recordEvent(dmId, "campaign_first_rated", `"${campaign.title}" received its first rating.`, {
    campaignId: campaign.id,
  });
}

function enrich(row: FeedEvent): FeedEventWithActor {
  return { ...row, actorName: getUserById(row.actor_id)?.display_name ?? "Unknown" };
}

/** The signed-in user's feed: every recorded public event from everyone
 * they follow, newest first, paginated -- same page/pageSize/total shape
 * as lib/boards.ts's listThreads()/lib/notifications.ts's
 * listNotifications(). A user who follows nobody (or whose follows have
 * no events yet) gets an empty page, not an error. */
export function listFeed(
  viewerId: string,
  opts: { page?: number; pageSize?: number } = {}
): { items: FeedEventWithActor[]; total: number } {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM feed_events
         JOIN follows ON follows.followed_id = feed_events.actor_id
         WHERE follows.follower_id = ?`
      )
      .get(viewerId) as { count: number }
  ).count;
  const rows = db
    .prepare(
      `SELECT feed_events.* FROM feed_events
       JOIN follows ON follows.followed_id = feed_events.actor_id
       WHERE follows.follower_id = ?
       ORDER BY feed_events.created_at DESC, feed_events.rowid DESC
       LIMIT ? OFFSET ?`
    )
    .all(viewerId, pageSize, (page - 1) * pageSize) as FeedEvent[];
  return { items: rows.map(enrich), total };
}
