import db from "./db";
import { getCampaign } from "./campaigns";
import { hasPrivateAccess } from "./access";
import { notify } from "./notifications";
import { myCampaigns } from "./profiles";

/** How long before a scheduled session a reminder should fire. This app
 * has no background job runner (see the module doc comment below for the
 * full limitation this drives), so there's no meaningful notion of "the
 * reminder fires at exactly T-24h" -- it fires the first time *any*
 * check-and-fire call after that threshold happens to run for that
 * user/campaign. 24h is a reasonable single default; not configurable
 * per-campaign in this pass. */
const DEFAULT_THRESHOLD_HOURS = 24;

/** Pure, deterministic: true if `nextSessionAt` is set, still in the
 * future relative to `now`, and within `thresholdHours` of `now`. A
 * session that's already past-due is never "due for a reminder" --
 * that's a missed/completed session, not an upcoming one. Takes `now`
 * as a parameter (defaulting to the real clock) so tests don't depend
 * on real wall-clock time, matching lib/schedule.ts's
 * computeScheduleStatus() convention. */
export function isReminderDue(
  nextSessionAt: string | null,
  now: Date = new Date(),
  thresholdHours: number = DEFAULT_THRESHOLD_HOURS
): boolean {
  if (!nextSessionAt) return false;
  const sessionTime = new Date(nextSessionAt).getTime();
  if (Number.isNaN(sessionTime)) return false;
  const nowTime = now.getTime();
  if (sessionTime < nowTime) return false; // already past-due, not upcoming
  const msUntil = sessionTime - nowTime;
  return msUntil <= thresholdHours * 60 * 60 * 1000;
}

/** Has a session_reminder notification already been sent to this user,
 * for this campaign, for this *exact* next_session_at value? Keyed by
 * the session_at value itself (not just campaign+user) so a reschedule
 * naturally allows a fresh reminder for the new date -- see
 * lib/db.ts's session_reminders_sent table comment. */
export function hasReminderBeenSent(
  campaignId: string,
  userId: string,
  sessionAt: string
): boolean {
  const row = db
    .prepare(
      "SELECT 1 FROM session_reminders_sent WHERE campaign_id = ? AND user_id = ? AND session_at = ?"
    )
    .get(campaignId, userId, sessionAt);
  return !!row;
}

function markReminderSent(campaignId: string, userId: string, sessionAt: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO session_reminders_sent (campaign_id, user_id, session_at, sent_at)
     VALUES (?, ?, ?, ?)`
  ).run(campaignId, userId, sessionAt, new Date().toISOString());
}

/**
 * Lazy reminder check-and-fire, backlog #35's answer to "an in-app
 * reminder notification as the date approaches" without any background
 * job runner or cron -- this app has none, and building one is
 * explicitly out of scope (it would need real always-on infrastructure,
 * the same category of thing blocking the deployment decision, #3).
 *
 * KNOWN LIMITATION, documented here and in claude/progress.md: a
 * reminder only actually fires when *this function is called* for the
 * given (campaignId, userId) pair -- there's no process watching the
 * clock in the background. It's wired into two real user-activity
 * triggers (GET /api/notifications, and loading a campaign's own detail
 * page -- see those call sites) so it fires "lazily" the next time the
 * signed-in user does something that happens to check, not necessarily
 * the instant the threshold is crossed. If nobody in a campaign opens
 * the app between the threshold and the session itself, nobody gets a
 * reminder for that session at all. This is an honest tradeoff for an
 * app with no worker process, not a bug -- same category as the SSE
 * reconnect scope-cut and the "sessions run" stat being a proxy (see
 * progress.md).
 *
 * Idempotent per (campaignId, userId, next_session_at value): once a
 * reminder is recorded as sent for the campaign's current
 * next_session_at, calling this again is a no-op until the date changes
 * (a fresh next_session_at is a fresh key in session_reminders_sent) or
 * the notification is otherwise re-triggerable. Fails safe (silently
 * returns) for a campaign that doesn't exist or a user with no private
 * access to it, so it's safe to call speculatively from a trigger point
 * that doesn't want to duplicate its own access checks.
 */
export function checkAndFireSessionReminder(
  campaignId: string,
  userId: string,
  now: Date = new Date()
): void {
  const campaign = getCampaign(campaignId);
  if (!campaign) return;
  if (!campaign.next_session_at) return;
  if (!hasPrivateAccess(userId, campaignId)) return;
  if (!isReminderDue(campaign.next_session_at, now)) return;
  if (hasReminderBeenSent(campaignId, userId, campaign.next_session_at)) return;

  notify(
    userId,
    "session_reminder",
    campaignId,
    `Your next session for "${campaign.title}" is coming up soon -- don't forget to RSVP.`
  );
  markReminderSent(campaignId, userId, campaign.next_session_at);
}

/** Runs checkAndFireSessionReminder for every campaign the given user
 * DMs or actively plays in (reusing lib/profiles.ts's myCampaigns(),
 * the same "campaigns I have private access to" set that page already
 * computes) -- the broader of this feature's two trigger points, wired
 * into GET /api/notifications so a reminder can fire regardless of
 * which specific campaign page (if any) the user happens to be looking
 * at. See checkAndFireSessionReminder's own doc comment for the lazy-
 * trigger limitation this is still subject to. */
export function checkAndFireSessionRemindersForUser(
  userId: string,
  now: Date = new Date()
): void {
  const { dming, playing } = myCampaigns(userId);
  const seen = new Set<string>();
  for (const campaign of [...dming, ...playing]) {
    if (seen.has(campaign.id)) continue;
    seen.add(campaign.id);
    checkAndFireSessionReminder(campaign.id, userId, now);
  }
}
