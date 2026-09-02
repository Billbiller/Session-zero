import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest } from "@/lib/memberships";
import { computeScheduleStatus, updateSchedule, ScheduleError } from "@/lib/schedule";
import { listNotifications } from "@/lib/notifications";

describe("computeScheduleStatus", () => {
  it("is unscheduled with no date", () => {
    expect(computeScheduleStatus(null)).toBe("unscheduled");
  });

  it("is upcoming for a future UTC instant", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    expect(computeScheduleStatus(future)).toBe("upcoming");
  });

  it("is past-due for a past UTC instant", () => {
    const past = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    expect(computeScheduleStatus(past)).toBe("past-due");
  });

  it("compares as UTC instants across a UTC-midnight boundary regardless of local wording", () => {
    // "now" sits just before UTC midnight; the scheduled time is a few minutes
    // after. This must read as upcoming purely by instant comparison, with no
    // dependence on any local timezone the test runner happens to have.
    const now = new Date("2026-01-14T23:50:00.000Z");
    const scheduled = "2026-01-15T00:05:00.000Z";
    expect(computeScheduleStatus(scheduled, now)).toBe("upcoming");

    const nowAfter = new Date("2026-01-15T00:10:00.000Z");
    expect(computeScheduleStatus(scheduled, nowAfter)).toBe("past-due");
  });
});

describe("updateSchedule", () => {
  function setup(emailPrefix: string) {
    const dm = signUp("DM", `${emailPrefix}-dm@example.com`, "testpassword123");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    const player = signUp("Player", `${emailPrefix}-p@example.com`, "testpassword123");
    const m = requestJoin(campaign.id, player.id);
    approveRequest(m.id, dm.id);
    return { dm, campaign, player };
  }

  it("lets the DM set a next-session date", () => {
    const { dm, campaign } = setup("sc1");
    const iso = new Date(Date.now() + 100000).toISOString();
    const updated = updateSchedule(campaign.id, dm.id, iso);
    expect(updated.next_session_at).toBe(iso);
  });

  it("rejects a non-DM update", () => {
    const { campaign, player } = setup("sc2");
    expect(() => updateSchedule(campaign.id, player.id, new Date().toISOString())).toThrow(
      ScheduleError
    );
  });

  it("notifies the rest of the party (not the DM) on a schedule change", () => {
    const { dm, campaign, player } = setup("sc3");
    updateSchedule(campaign.id, dm.id, new Date(Date.now() + 100000).toISOString());
    expect(
      listNotifications(player.id).items.some((n) => n.type === "schedule_updated")
    ).toBe(true);
    expect(
      listNotifications(dm.id).items.some((n) => n.type === "schedule_updated")
    ).toBe(false);
  });

  it("allows clearing the schedule back to unscheduled", () => {
    const { dm, campaign } = setup("sc4");
    updateSchedule(campaign.id, dm.id, new Date().toISOString());
    const cleared = updateSchedule(campaign.id, dm.id, null);
    expect(cleared.next_session_at).toBeNull();
  });
});
