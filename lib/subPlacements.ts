import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getCampaign } from "./campaigns";
import { getCharacter } from "./characters";
import { getSubRequest, isRequesterOrDm } from "./subRequests";
import { activePartyUserIds } from "./access";
import { notify, notifyMany } from "./notifications";
import type { SubPlacement, SubPlacementSummary, SubRequest } from "./types";

export class SubPlacementError extends Error {}

const MAX_GUARDRAILS_NOTE = 500;

export function getPlacement(id: string): SubPlacement | null {
  const row = db.prepare("SELECT * FROM sub_placements WHERE id = ?").get(id) as
    | SubPlacement
    | undefined;
  return row ?? null;
}

function displayName(userId: string): string {
  return (
    (db.prepare("SELECT display_name FROM users WHERE id = ?").get(userId) as
      | { display_name: string }
      | undefined)?.display_name ?? "Unknown"
  );
}

function toSummary(placement: SubPlacement, request: SubRequest): SubPlacementSummary {
  const campaign = getCampaign(request.campaign_id);
  const character = request.character_id ? getCharacter(request.character_id) : null;
  return {
    ...placement,
    volunteerName: displayName(placement.volunteer_id),
    characterName: character?.name ?? "Unknown character",
    ownerId: request.requester_id,
    ownerName: displayName(request.requester_id),
    dmId: campaign?.dm_id ?? "",
    dmName: campaign ? displayName(campaign.dm_id) : "Unknown",
  };
}

/** Every placement (any status) for one request, oldest first -- shown
 * alongside the request on the campaign page. Public in the same sense
 * the request itself is (see lib/subRequests.ts): this is informational
 * for the whole party, not restricted to the owner/DM. Only the actual
 * approve/decline/cancel actions below are access-checked. */
export function listPlacementsForRequest(requestId: string): SubPlacementSummary[] {
  const request = getSubRequest(requestId);
  if (!request) throw new SubPlacementError("Sub request not found.");
  const rows = db
    .prepare("SELECT * FROM sub_placements WHERE request_id = ? ORDER BY created_at ASC")
    .all(requestId) as SubPlacement[];
  return rows.map((row) => toSummary(row, request));
}

function activePlacementFor(requestId: string): SubPlacement | null {
  const row = db
    .prepare(
      "SELECT * FROM sub_placements WHERE request_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1"
    )
    .get(requestId) as SubPlacement | undefined;
  return row ?? null;
}

/** Moves a volunteer forward for owner/DM approval. Restricted to the
 * requester or DM (same as setSubRequestStatus), and only for a request
 * that names a character -- a characterless request has no owner and
 * nothing to hand temporary custody of, so it can only ever be resolved
 * directly via setSubRequestStatus. Only one pending placement per
 * request at a time; the chosen person must actually be in that
 * request's volunteer pool, not picked out of thin air. */
export function createPlacement(
  requestId: string,
  actorId: string,
  volunteerId: string
): SubPlacement {
  const request = getSubRequest(requestId);
  if (!request) throw new SubPlacementError("Sub request not found.");
  if (!isRequesterOrDm(request, actorId)) {
    throw new SubPlacementError("Only the requester or DM can select a volunteer.");
  }
  if (request.status !== "open") {
    throw new SubPlacementError("This request is no longer open.");
  }
  if (!request.character_id) {
    throw new SubPlacementError(
      "This request has no character attached, so it can't go through approval -- mark it filled directly instead."
    );
  }
  const isVolunteer = db
    .prepare("SELECT 1 FROM sub_volunteers WHERE request_id = ? AND volunteer_id = ?")
    .get(requestId, volunteerId);
  if (!isVolunteer) {
    throw new SubPlacementError("That person hasn't volunteered for this request.");
  }
  if (activePlacementFor(requestId)) {
    throw new SubPlacementError("A placement is already pending for this request.");
  }

  const now = new Date().toISOString();
  const placement: SubPlacement = {
    id: uuidv4(),
    request_id: requestId,
    volunteer_id: volunteerId,
    guardrails_note: "",
    owner_approved: 0,
    dm_approved: 0,
    status: "pending",
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO sub_placements (id, request_id, volunteer_id, guardrails_note, owner_approved, dm_approved, status, created_at, updated_at)
     VALUES (@id, @request_id, @volunteer_id, @guardrails_note, @owner_approved, @dm_approved, @status, @created_at, @updated_at)`
  ).run(placement);

  const campaign = getCampaign(request.campaign_id);
  // Notify whichever of {owner, DM} didn't create the placement (they
  // still need to review), and the volunteer that they've been selected.
  const reviewTargets = new Set<string>([request.requester_id]);
  if (campaign) reviewTargets.add(campaign.dm_id);
  reviewTargets.delete(actorId);
  reviewTargets.add(volunteerId);
  for (const userId of reviewTargets) {
    notify(
      userId,
      "sub_placement_pending",
      request.campaign_id,
      `A sub placement needs review${campaign ? ` for "${campaign.title}"` : ""}.`
    );
  }

  return placement;
}

function resolveIfBothApproved(placement: SubPlacement, request: SubRequest): SubPlacement {
  if (!(placement.owner_approved && placement.dm_approved)) return placement;

  const now = new Date().toISOString();
  db.prepare(
    "UPDATE sub_placements SET status = 'confirmed', updated_at = ? WHERE id = ?"
  ).run(now, placement.id);
  db.prepare("UPDATE characters SET temp_pilot_user_id = ? WHERE id = ?").run(
    placement.volunteer_id,
    request.character_id
  );
  db.prepare("UPDATE sub_requests SET status = 'filled', updated_at = ? WHERE id = ?").run(
    now,
    request.id
  );

  notifyResolved(placement, request, "confirmed");

  return getPlacement(placement.id) as SubPlacement;
}

/** Notifies the volunteer, owner, DM, and the rest of the active party
 * (informational, per the 2026-09-06 product decision that the table
 * isn't a blocking approval gate) once a placement reaches a terminal
 * outcome. */
function notifyResolved(
  placement: SubPlacement,
  request: SubRequest,
  outcome: "confirmed" | "declined" | "cancelled"
): void {
  const campaign = getCampaign(request.campaign_id);
  const character = request.character_id ? getCharacter(request.character_id) : null;
  const characterLabel = character ? `for ${character.name}` : "";
  const messages: Record<typeof outcome, string> = {
    confirmed: `A sub is confirmed ${characterLabel}${campaign ? ` in "${campaign.title}"` : ""}.`,
    declined: `A sub placement ${characterLabel} was declined${campaign ? ` in "${campaign.title}"` : ""}.`,
    cancelled: `A sub placement ${characterLabel} was cancelled${campaign ? ` in "${campaign.title}"` : ""}.`,
  };
  const targets = new Set<string>([placement.volunteer_id, request.requester_id]);
  if (campaign) {
    targets.add(campaign.dm_id);
    for (const userId of activePartyUserIds(campaign.id)) targets.add(userId);
  }
  notifyMany(Array.from(targets), "sub_placement_resolved", request.campaign_id, messages[outcome]);
}

/** The character owner's review -- always the request's own requester
 * (see createSubRequest's validation that a request can only name a
 * character the requester owns). Sets the guardrails note (even on a
 * decline, so it's preserved for the record) and either approves or
 * declines. Declining ends the placement immediately without waiting on
 * the DM. */
export function ownerReview(
  placementId: string,
  ownerId: string,
  input: { approve: boolean; guardrailsNote?: string }
): SubPlacement {
  const placement = getPlacement(placementId);
  if (!placement) throw new SubPlacementError("Placement not found.");
  const request = getSubRequest(placement.request_id);
  if (!request) throw new SubPlacementError("Sub request not found.");
  if (request.requester_id !== ownerId) {
    throw new SubPlacementError("Only the character's owner can give this review.");
  }
  if (placement.status !== "pending") {
    throw new SubPlacementError("This placement is no longer pending.");
  }

  const guardrailsNote = (input.guardrailsNote ?? placement.guardrails_note).trim();
  if (guardrailsNote.length > MAX_GUARDRAILS_NOTE) {
    throw new SubPlacementError(
      `Guardrails note can't be longer than ${MAX_GUARDRAILS_NOTE} characters.`
    );
  }

  if (!input.approve) {
    db.prepare(
      "UPDATE sub_placements SET guardrails_note = ?, status = 'declined', updated_at = ? WHERE id = ?"
    ).run(guardrailsNote, new Date().toISOString(), placementId);
    const declined = getPlacement(placementId) as SubPlacement;
    notifyResolved(declined, request, "declined");
    return declined;
  }

  db.prepare(
    "UPDATE sub_placements SET guardrails_note = ?, owner_approved = 1, updated_at = ? WHERE id = ?"
  ).run(guardrailsNote, new Date().toISOString(), placementId);
  return resolveIfBothApproved(getPlacement(placementId) as SubPlacement, request);
}

/** The DM's review. Declining ends the placement immediately without
 * needing the owner's decision either way. */
export function dmReview(placementId: string, dmId: string, approve: boolean): SubPlacement {
  const placement = getPlacement(placementId);
  if (!placement) throw new SubPlacementError("Placement not found.");
  const request = getSubRequest(placement.request_id);
  if (!request) throw new SubPlacementError("Sub request not found.");
  const campaign = getCampaign(request.campaign_id);
  if (!campaign || campaign.dm_id !== dmId) {
    throw new SubPlacementError("Only the campaign's DM can give this review.");
  }
  if (placement.status !== "pending") {
    throw new SubPlacementError("This placement is no longer pending.");
  }

  if (!approve) {
    db.prepare(
      "UPDATE sub_placements SET status = 'declined', updated_at = ? WHERE id = ?"
    ).run(new Date().toISOString(), placementId);
    const declined = getPlacement(placementId) as SubPlacement;
    notifyResolved(declined, request, "declined");
    return declined;
  }

  db.prepare("UPDATE sub_placements SET dm_approved = 1, updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    placementId
  );
  return resolveIfBothApproved(getPlacement(placementId) as SubPlacement, request);
}

/** The requester or DM can cancel a still-pending placement outright
 * (e.g. the volunteer backed out) without needing a formal decline from
 * either reviewer. */
export function cancelPlacement(placementId: string, actorId: string): SubPlacement {
  const placement = getPlacement(placementId);
  if (!placement) throw new SubPlacementError("Placement not found.");
  const request = getSubRequest(placement.request_id);
  if (!request) throw new SubPlacementError("Sub request not found.");
  if (!isRequesterOrDm(request, actorId)) {
    throw new SubPlacementError("Only the requester or DM can cancel a placement.");
  }
  if (placement.status !== "pending") {
    throw new SubPlacementError("This placement is no longer pending.");
  }
  db.prepare(
    "UPDATE sub_placements SET status = 'cancelled', updated_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), placementId);
  const cancelled = getPlacement(placementId) as SubPlacement;
  notifyResolved(cancelled, request, "cancelled");
  return cancelled;
}

/** Clears a character's temporary-pilot marker once the sub's session is
 * over. Restricted to the character's owner or the campaign's DM. This
 * app has no session-duration tracking to do this automatically, so it's
 * an explicit action -- the confirmed placement record itself is left
 * alone as history; only the character's live state changes. */
export function endSub(characterId: string, actorId: string): void {
  const character = getCharacter(characterId);
  if (!character) throw new SubPlacementError("Character not found.");
  const campaign = character.campaign_id ? getCampaign(character.campaign_id) : null;
  const isOwner = character.user_id === actorId;
  const isDm = campaign?.dm_id === actorId;
  if (!isOwner && !isDm) {
    throw new SubPlacementError("Only the character's owner or the campaign's DM can end a sub.");
  }
  db.prepare("UPDATE characters SET temp_pilot_user_id = NULL WHERE id = ?").run(characterId);
}

