import db from "./db";
import { getCampaign } from "./campaigns";
import { getUserById } from "./auth";
import { hasPrivateAccess, activePartyUserIds } from "./access";
import { RSVP_RESPONSES, type RsvpResponse, type SessionRsvp, type SessionRsvpSummary } from "./types";

export class RsvpError extends Error {}

function isKnownResponse(value: string): value is RsvpResponse {
  return (RSVP_RESPONSES as readonly string[]).includes(value);
}

/** Every active party member (DM + approved members), enriched with
 * their current RSVP response (null if they haven't answered). Callers
 * must check hasPrivateAccess themselves before calling this -- same
 * convention as lib/campaignMessages.ts's listCampaignMessages()/
 * lib/partyNotes.ts's getNotes(), where the access check lives at the
 * call site rather than being duplicated inside every read helper. */
export function listRsvps(campaignId: string): SessionRsvpSummary[] {
  const campaign = getCampaign(campaignId);
  if (!campaign) return [];
  const rows = db
    .prepare("SELECT * FROM session_rsvps WHERE campaign_id = ?")
    .all(campaignId) as SessionRsvp[];
  const responseByUser = new Map(rows.map((r) => [r.user_id, r.response]));
  return activePartyUserIds(campaignId).map((userId) => ({
    userId,
    userName: getUserById(userId)?.display_name ?? "Unknown",
    isDm: userId === campaign.dm_id,
    response: responseByUser.get(userId) ?? null,
  }));
}

/** The signed-in viewer's own current response, or null if they haven't
 * RSVPed (or have no row at all). */
export function getViewerRsvp(campaignId: string, userId: string): RsvpResponse | null {
  const row = db
    .prepare("SELECT response FROM session_rsvps WHERE campaign_id = ? AND user_id = ?")
    .get(campaignId, userId) as { response: RsvpResponse } | undefined;
  return row?.response ?? null;
}

/** Sets, changes, or clears (response = null) the caller's own RSVP for
 * a campaign's current next_session_at. Restricted to the same
 * hasPrivateAccess boundary already gating party notes/schedule/chat
 * (DM + approved active members) -- RSVPing to a table you're not
 * actually part of makes no sense, same reasoning as every other
 * private-side feature. Also requires a session to actually be
 * scheduled (next_session_at set) -- an RSVP with nothing to confirm or
 * decline isn't meaningful, and the reset-on-reschedule behavior in
 * lib/schedule.ts depends on every existing row always answering the
 * *current* date, which only holds if rows can't be created while
 * unscheduled. */
export function setRsvp(
  campaignId: string,
  userId: string,
  response: RsvpResponse | null
): RsvpResponse | null {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new RsvpError("Campaign not found.");
  if (!hasPrivateAccess(userId, campaignId)) {
    throw new RsvpError("Only the DM or an active member of this campaign can RSVP.");
  }
  if (response !== null && !isKnownResponse(response)) {
    throw new RsvpError("Invalid RSVP response.");
  }
  if (!campaign.next_session_at) {
    throw new RsvpError("There's no scheduled session to RSVP to yet.");
  }

  if (response === null) {
    db.prepare("DELETE FROM session_rsvps WHERE campaign_id = ? AND user_id = ?").run(
      campaignId,
      userId
    );
    return null;
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO session_rsvps (campaign_id, user_id, response, created_at, updated_at)
     VALUES (@campaign_id, @user_id, @response, @created_at, @updated_at)
     ON CONFLICT (campaign_id, user_id) DO UPDATE SET response = excluded.response, updated_at = excluded.updated_at`
  ).run({
    campaign_id: campaignId,
    user_id: userId,
    response,
    created_at: now,
    updated_at: now,
  });
  return response;
}

/** Clears every RSVP for a campaign -- called by lib/schedule.ts's
 * updateSchedule() whenever next_session_at actually changes value.
 * An RSVP for a date that's no longer the scheduled date is meaningless
 * (see lib/db.ts's session_rsvps table comment for the full reasoning),
 * so rather than tracking which date each row answered, every row is
 * simply dropped the moment the date it implicitly referred to changes. */
export function clearRsvpsForCampaign(campaignId: string): void {
  db.prepare("DELETE FROM session_rsvps WHERE campaign_id = ?").run(campaignId);
}
