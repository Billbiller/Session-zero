import db from "./db";
import { getCampaign } from "./campaigns";
import { notify } from "./notifications";
import { activePartyUserIds } from "./access";
import { clearRsvpsForCampaign } from "./sessionRsvps";
import type { Campaign, ScheduleStatus } from "./types";

export class ScheduleError extends Error {}

/** Compared as UTC instants, so this is timezone-safe regardless of server/client TZ. */
export function computeScheduleStatus(
  nextSessionAt: string | null,
  now: Date = new Date()
): ScheduleStatus {
  if (!nextSessionAt) return "unscheduled";
  const scheduled = new Date(nextSessionAt);
  return scheduled.getTime() >= now.getTime() ? "upcoming" : "past-due";
}

export function updateSchedule(
  campaignId: string,
  dmId: string,
  nextSessionAt: string | null
): Campaign {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new ScheduleError("Campaign not found.");
  if (campaign.dm_id !== dmId) {
    throw new ScheduleError("Only the DM can update the schedule.");
  }
  if (nextSessionAt) {
    const parsed = new Date(nextSessionAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new ScheduleError("Invalid date.");
    }
  }
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE campaigns SET next_session_at = ?, updated_at = ? WHERE id = ?"
  ).run(nextSessionAt, now, campaignId);

  // Backlog #35: an RSVP for last week's date is meaningless once the
  // date changes -- clear every existing RSVP the moment the scheduled
  // date actually changes (including being cleared back to unscheduled).
  // A no-op re-save of the same value doesn't wipe anyone's answer.
  if (nextSessionAt !== campaign.next_session_at) {
    clearRsvpsForCampaign(campaignId);
  }

  const others = activePartyUserIds(campaignId).filter((id) => id !== dmId);
  for (const userId of others) {
    notify(
      userId,
      "schedule_updated",
      campaignId,
      `The next session time for "${campaign.title}" has changed.`
    );
  }
  return getCampaign(campaignId) as Campaign;
}
