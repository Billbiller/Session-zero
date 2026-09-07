import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest } from "@/lib/memberships";
import { updateSchedule } from "@/lib/schedule";
import { listNotifications } from "@/lib/notifications";
import { setPreference } from "@/lib/notificationPreferences";
import {
  isReminderDue,
  hasReminderBeenSent,
  checkAndFireSessionReminder,
  checkAndFireSessionRemindersForUser,
} from "@/lib/sessionReminders";

describe("isReminderDue (pure)", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");

  it("is false with no scheduled date", () => {
    expect(isReminderDue(null, now)).toBe(false);
  });

  it("is false when the session is more than the threshold away", () => {
    const farOut = new Date(now.getTime() + 1000 * 60 * 60 * 48).toISOString(); // 48h out
    expect(isReminderDue(farOut, now)).toBe(false);
  });

  it("is true when the session is within the default 24h threshold and still upcoming", () => {
    const soon = new Date(now.getTime() + 1000 * 60 * 60 * 10).toISOString(); // 10h out
    expect(isReminderDue(soon, now)).toBe(true);
  });

  it("is true exactly at the threshold boundary", () => {
    const atThreshold = new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString();
    expect(isReminderDue(atThreshold, now)).toBe(true);
  });

  it("is false once the session is already past-due", () => {
    const past = new Date(now.getTime() - 1000 * 60 * 60).toISOString();
    expect(isReminderDue(past, now)).toBe(false);
  });

  it("respects a custom threshold", () => {
    const in6h = new Date(now.getTime() + 1000 * 60 * 60 * 6).toISOString();
    expect(isReminderDue(in6h, now, 24)).toBe(true);
    expect(isReminderDue(in6h, now, 2)).toBe(false);
  });

  it("is false for an unparseable date string", () => {
    expect(isReminderDue("not-a-date", now)).toBe(false);
  });
});

function setupParty(emailPrefix: string) {
  const dm = signUp("DM", `${emailPrefix}-dm@example.com`, "testpassword123");
  const campaign = createCampaign({
    dmId: dm.id,
    title: "The Sunken Keep",
    description: "",
    system: "S",
    capacity: 4,
  });
  const p1 = signUp("P1", `${emailPrefix}-p1@example.com`, "testpassword123");
  const m = requestJoin(campaign.id, p1.id);
  approveRequest(m.id, dm.id);
  return { dm, campaign, p1 };
}

function reminderNotifs(userId: string) {
  return listNotifications(userId).items.filter((n) => n.type === "session_reminder");
}

describe("checkAndFireSessionReminder", () => {
  it("fires exactly once when the session is within the reminder window", () => {
    const { dm, campaign, p1 } = setupParty("rem1");
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 10).toISOString();
    updateSchedule(campaign.id, dm.id, soon);

    const now = new Date(Date.now());
    checkAndFireSessionReminder(campaign.id, p1.id, now);
    expect(reminderNotifs(p1.id)).toHaveLength(1);
    expect(hasReminderBeenSent(campaign.id, p1.id, soon)).toBe(true);
  });

  it("does not duplicate the reminder on a second check for the same session date", () => {
    const { dm, campaign, p1 } = setupParty("rem2");
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 10).toISOString();
    updateSchedule(campaign.id, dm.id, soon);

    const now = new Date(Date.now());
    checkAndFireSessionReminder(campaign.id, p1.id, now);
    checkAndFireSessionReminder(campaign.id, p1.id, now);
    checkAndFireSessionReminder(campaign.id, p1.id, new Date(now.getTime() + 60000));
    expect(reminderNotifs(p1.id)).toHaveLength(1);
  });

  it("does nothing when the session is further out than the threshold", () => {
    const { dm, campaign, p1 } = setupParty("rem3");
    const farOut = new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString();
    updateSchedule(campaign.id, dm.id, farOut);
    checkAndFireSessionReminder(campaign.id, p1.id, new Date());
    expect(reminderNotifs(p1.id)).toHaveLength(0);
  });

  it("does nothing when there's no scheduled session", () => {
    const { campaign, p1 } = setupParty("rem4");
    checkAndFireSessionReminder(campaign.id, p1.id, new Date());
    expect(reminderNotifs(p1.id)).toHaveLength(0);
  });

  it("does nothing for a user with no private access to the campaign", () => {
    const { dm, campaign } = setupParty("rem5");
    const stranger = signUp("Stranger", "rem5-s@example.com", "testpassword123");
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 10).toISOString();
    updateSchedule(campaign.id, dm.id, soon);
    checkAndFireSessionReminder(campaign.id, stranger.id, new Date());
    expect(reminderNotifs(stranger.id)).toHaveLength(0);
  });

  it("does nothing for an unknown campaign id", () => {
    const { p1 } = setupParty("rem6");
    expect(() => checkAndFireSessionReminder("no-such-campaign", p1.id, new Date())).not.toThrow();
    expect(reminderNotifs(p1.id)).toHaveLength(0);
  });

  it("fires again for a fresh reminder after the session is rescheduled to a new date within the window", () => {
    const { dm, campaign, p1 } = setupParty("rem7");
    const firstDate = new Date(Date.now() + 1000 * 60 * 60 * 10).toISOString();
    updateSchedule(campaign.id, dm.id, firstDate);
    checkAndFireSessionReminder(campaign.id, p1.id, new Date());
    expect(reminderNotifs(p1.id)).toHaveLength(1);

    const secondDate = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
    updateSchedule(campaign.id, dm.id, secondDate);
    checkAndFireSessionReminder(campaign.id, p1.id, new Date());
    expect(reminderNotifs(p1.id)).toHaveLength(2);
  });

  it("respects a muted session_reminder preference", () => {
    const { dm, campaign, p1 } = setupParty("rem8");
    setPreference(p1.id, "session_reminder", false);
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 10).toISOString();
    updateSchedule(campaign.id, dm.id, soon);
    checkAndFireSessionReminder(campaign.id, p1.id, new Date());
    expect(reminderNotifs(p1.id)).toHaveLength(0);
  });
});

describe("checkAndFireSessionRemindersForUser", () => {
  it("checks every campaign the user DMs or plays in, firing independently per campaign", () => {
    const { dm, campaign: campaignA, p1 } = setupParty("remall1a");
    const dm2 = signUp("DM2", "remall1b-dm@example.com", "testpassword123");
    const campaignB = createCampaign({
      dmId: dm2.id,
      title: "Second table",
      description: "",
      system: "S",
      capacity: 4,
    });
    const m = requestJoin(campaignB.id, p1.id);
    approveRequest(m.id, dm2.id);

    const soon = new Date(Date.now() + 1000 * 60 * 60 * 10).toISOString();
    updateSchedule(campaignA.id, dm.id, soon);
    updateSchedule(campaignB.id, dm2.id, soon);

    checkAndFireSessionRemindersForUser(p1.id, new Date());
    const notifs = reminderNotifs(p1.id);
    expect(notifs).toHaveLength(2);
    expect(new Set(notifs.map((n) => n.campaign_id))).toEqual(
      new Set([campaignA.id, campaignB.id])
    );
  });

  it("is a no-op for a user with no campaigns", () => {
    const lonely = signUp("Lonely", "remall2@example.com", "testpassword123");
    expect(() => checkAndFireSessionRemindersForUser(lonely.id, new Date())).not.toThrow();
    expect(reminderNotifs(lonely.id)).toHaveLength(0);
  });
});
