import db from "./db";
import { getCampaign } from "./campaigns";
import { notify } from "./notifications";
import { activePartyUserIds } from "./access";
import { clearRsvpsForCampaign } from "./sessionRsvps";
import { RECURRENCES, type Campaign, type Recurrence, type ScheduleStatus } from "./types";

export class ScheduleError extends Error {}

function isKnownRecurrence(value: string): value is Recurrence {
  return (RECURRENCES as readonly string[]).includes(value);
}

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
  nextSessionAt: string | null,
  /** Backlog #70: an optional weekly/biweekly cadence, always set/cleared
   * together with nextSessionAt -- they're edited in the same
   * ScheduleForm control and describe the same schedule, so this
   * defaults to null (no recurrence) rather than "leave unchanged" like
   * updateCampaign's own fields. Clearing nextSessionAt back to null
   * always clears recurrence too, since a cadence with no anchor date is
   * meaningless. */
  recurrence: Recurrence | null = null
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
  if (recurrence !== null && !isKnownRecurrence(recurrence)) {
    throw new ScheduleError("Not a recognized recurrence.");
  }
  const nextRecurrence = nextSessionAt ? recurrence : null;
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE campaigns SET next_session_at = ?, recurrence = ?, updated_at = ? WHERE id = ?"
  ).run(nextSessionAt, nextRecurrence, now, campaignId);

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
