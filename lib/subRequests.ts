import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getCampaign } from "./campaigns";
import { getCharacter } from "./characters";
import { hasPrivateAccess } from "./access";
import { notify } from "./notifications";
import type {
  SubRequest,
  SubRequestStatus,
  SubRequestSummary,
  SubVolunteer,
  SubVolunteerWithName,
} from "./types";

export class SubRequestError extends Error {}

const MAX_NOTE = 500;
const MAX_MESSAGE = 500;

export function isRequesterOrDm(request: SubRequest, userId: string): boolean {
  if (request.requester_id === userId) return true;
  const campaign = getCampaign(request.campaign_id);
  return campaign?.dm_id === userId;
}

export function getSubRequest(id: string): SubRequest | null {
  const row = db.prepare("SELECT * FROM sub_requests WHERE id = ?").get(id) as
    | SubRequest
    | undefined;
  return row ?? null;
}

/** Posts a "looking for a sub" request for an upcoming session. Restricted
 * to the DM or an active member of the campaign -- the same boundary as
 * the private-side features (session log, party notes), since only
 * someone actually at the table has a session to fill.
 *
 * characterId is optional, but when given it must be a character the
 * requester themselves owns AND that's currently linked to this same
 * campaign -- this is what lets phase 2 treat "the requester" and "the
 * character owner" as always the same person (see isRequesterOrDm and
 * lib/subPlacements.ts), rather than needing a separate owner concept. A
 * request with no character stays phase-1-only: it can be marked
 * filled/cancelled directly, but never enters the approval workflow. */
export function createSubRequest(
  campaignId: string,
  requesterId: string,
  note: string,
  characterId?: string | null
): SubRequest {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new SubRequestError("Campaign not found.");
  if (!hasPrivateAccess(requesterId, campaignId)) {
    throw new SubRequestError(
      "Only the DM or an active member of this campaign can post a sub request."
    );
  }
  const trimmed = note.trim();
  if (trimmed.length > MAX_NOTE) {
    throw new SubRequestError(`Note can't be longer than ${MAX_NOTE} characters.`);
  }
  let resolvedCharacterId: string | null = null;
  if (characterId) {
    const character = getCharacter(characterId);
    if (!character) throw new SubRequestError("Character not found.");
    if (character.user_id !== requesterId) {
      throw new SubRequestError("You can only post a sub request for your own character.");
    }
    if (character.campaign_id !== campaignId) {
      throw new SubRequestError("That character isn't currently linked to this campaign.");
    }
    resolvedCharacterId = characterId;
  }
  const now = new Date().toISOString();
  const request: SubRequest = {
    id: uuidv4(),
    campaign_id: campaignId,
    requester_id: requesterId,
    character_id: resolvedCharacterId,
    note: trimmed,
    status: "open",
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO sub_requests (id, campaign_id, requester_id, character_id, note, status, created_at, updated_at)
     VALUES (@id, @campaign_id, @requester_id, @character_id, @note, @status, @created_at, @updated_at)`
  ).run(request);
  return request;
}

function volunteerCountFor(requestId: string): number {
  return (
    db.prepare("SELECT COUNT(*) as count FROM sub_volunteers WHERE request_id = ?").get(
      requestId
    ) as { count: number }
  ).count;
}

/** Shared enrichment step behind both the campaign-page panel and the
 * app-wide browse pool -- joins in the campaign/requester display info
 * and each request's volunteer count, plus whether the given viewer (or
 * no one, if signed out) has already volunteered. viewerId is compared
 * against an impossible value ("") when null rather than branching the
 * query, since no real user id is ever an empty string. */
function withContext(rows: SubRequest[], viewerId: string | null): SubRequestSummary[] {
  return rows.map((row) => {
    const campaign = getCampaign(row.campaign_id);
    const requester = db
      .prepare("SELECT display_name FROM users WHERE id = ?")
      .get(row.requester_id) as { display_name: string } | undefined;
    const viewerHasVolunteered = viewerId
      ? !!db
          .prepare("SELECT 1 FROM sub_volunteers WHERE request_id = ? AND volunteer_id = ?")
          .get(row.id, viewerId)
      : false;
    const character = row.character_id ? getCharacter(row.character_id) : null;
    return {
      ...row,
      campaignTitle: campaign?.title ?? "Unknown campaign",
      campaignSystem: campaign?.system ?? "",
      requesterName: requester?.display_name ?? "Unknown",
      characterName: character?.name ?? null,
      volunteerCount: volunteerCountFor(row.id),
      viewerHasVolunteered,
    };
  });
}

/** Every sub request for one campaign (any status), newest first -- shown
 * on the campaign's own page. Public, like the roster and character list
 * on that same page: inviting an outside volunteer is the whole point, so
 * this deliberately isn't gated behind hasPrivateAccess. */
export function listSubRequestsForCampaign(
  campaignId: string,
  viewerId: string | null
): SubRequestSummary[] {
  const rows = db
    .prepare(
      "SELECT * FROM sub_requests WHERE campaign_id = ? ORDER BY created_at DESC, rowid DESC"
    )
    .all(campaignId) as SubRequest[];
  return withContext(rows, viewerId);
}

/** The app-wide browsable volunteer pool: every currently-open request
 * across every campaign, newest first. */
export function listOpenSubRequests(viewerId: string | null): SubRequestSummary[] {
  const rows = db
    .prepare(
      "SELECT * FROM sub_requests WHERE status = 'open' ORDER BY created_at DESC, rowid DESC"
    )
    .all() as SubRequest[];
  return withContext(rows, viewerId);
}

/** Expresses interest in subbing in for a request. Volunteering again
 * with a new message updates the existing volunteer row instead of
 * duplicating it (and does NOT re-notify -- only a fresh volunteer does),
 * matching the upsert-not-duplicate convention this codebase already uses
 * for ratings. The requester can't volunteer for their own request. */
export function volunteerForSubRequest(
  requestId: string,
  volunteerId: string,
  message: string
): SubVolunteer {
  const request = getSubRequest(requestId);
  if (!request) throw new SubRequestError("Sub request not found.");
  if (request.status !== "open") {
    throw new SubRequestError("This request is no longer open.");
  }
  if (request.requester_id === volunteerId) {
    throw new SubRequestError("You can't volunteer for your own request.");
  }
  const trimmed = message.trim();
  if (trimmed.length > MAX_MESSAGE) {
    throw new SubRequestError(`Message can't be longer than ${MAX_MESSAGE} characters.`);
  }

  const existing = db
    .prepare("SELECT id FROM sub_volunteers WHERE request_id = ? AND volunteer_id = ?")
    .get(requestId, volunteerId) as { id: string } | undefined;

  let volunteerRowId: string;
  if (existing) {
    volunteerRowId = existing.id;
    db.prepare("UPDATE sub_volunteers SET message = ? WHERE id = ?").run(trimmed, volunteerRowId);
  } else {
    volunteerRowId = uuidv4();
    db.prepare(
      "INSERT INTO sub_volunteers (id, request_id, volunteer_id, message, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(volunteerRowId, requestId, volunteerId, trimmed, new Date().toISOString());

    const campaign = getCampaign(request.campaign_id);
    const targets = new Set<string>([request.requester_id]);
    if (campaign) targets.add(campaign.dm_id);
    for (const userId of targets) {
      notify(
        userId,
        "sub_volunteer",
        request.campaign_id,
        `Someone volunteered to sub in${campaign ? ` for "${campaign.title}"` : ""}.`
      );
    }
  }

  return db.prepare("SELECT * FROM sub_volunteers WHERE id = ?").get(volunteerRowId) as SubVolunteer;
}

export function withdrawVolunteer(requestId: string, volunteerId: string): void {
  db.prepare("DELETE FROM sub_volunteers WHERE request_id = ? AND volunteer_id = ?").run(
    requestId,
    volunteerId
  );
}

/** Volunteer identities are only visible to the request's own owner (the
 * requester or their DM) -- not broadcast to every browser of the pool,
 * unlike the request itself which is intentionally public. */
export function listVolunteers(requestId: string, viewerId: string): SubVolunteerWithName[] {
  const request = getSubRequest(requestId);
  if (!request) throw new SubRequestError("Sub request not found.");
  if (!isRequesterOrDm(request, viewerId)) {
    throw new SubRequestError("Only the requester or DM can view volunteers.");
  }
  const rows = db
    .prepare("SELECT * FROM sub_volunteers WHERE request_id = ? ORDER BY created_at ASC")
    .all(requestId) as SubVolunteer[];
  return rows.map((row) => ({
    ...row,
    volunteerName:
      (db.prepare("SELECT display_name FROM users WHERE id = ?").get(row.volunteer_id) as
        | { display_name: string }
        | undefined)?.display_name ?? "Unknown",
  }));
}

/** Moves a request to a terminal state. Restricted to the requester or
 * DM, and only from "open" -- a filled/cancelled request is final for
 * this phase (no reopening), matching how tightly scoped this first
 * slice is meant to be. */
export function setSubRequestStatus(
  requestId: string,
  actorId: string,
  status: Extract<SubRequestStatus, "filled" | "cancelled">
): SubRequest {
  const request = getSubRequest(requestId);
  if (!request) throw new SubRequestError("Sub request not found.");
  if (!isRequesterOrDm(request, actorId)) {
    throw new SubRequestError("Only the requester or DM can update this request.");
  }
  if (request.status !== "open") {
    throw new SubRequestError("This request is no longer open.");
  }
  db.prepare("UPDATE sub_requests SET status = ?, updated_at = ? WHERE id = ?").run(
    status,
    new Date().toISOString(),
    requestId
  );
  return getSubRequest(requestId) as SubRequest;
}
