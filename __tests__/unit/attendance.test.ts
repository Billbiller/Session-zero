import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest, leaveCampaign } from "@/lib/memberships";
import { createEntry } from "@/lib/sessionLog";
import {
  attendanceCandidates,
  listEntryAttendance,
  setEntryAttendance,
  getAttendanceStats,
  AttendanceError,
} from "@/lib/attendance";

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
  const p2 = signUp("P2", `${emailPrefix}-p2@example.com`, "testpassword123");
  for (const p of [p1, p2]) {
    const m = requestJoin(campaign.id, p.id);
    approveRequest(m.id, dm.id);
  }
  return { dm, campaign, p1, p2 };
}

describe("attendance-based reliability signal (backlog #39)", () => {
  it("attendanceCandidates is the active party minus the DM", () => {
    const { dm, campaign, p1, p2 } = setupParty("att1");
    const candidates = attendanceCandidates(campaign.id);
    expect(candidates).toContain(p1.id);
    expect(candidates).toContain(p2.id);
    expect(candidates).not.toContain(dm.id);
  });

  it("a brand-new user with no recorded attendance reads as no-data, not 0%", () => {
    const { p1 } = setupParty("att2");
    expect(getAttendanceStats(p1.id)).toEqual({ recorded: 0, attended: 0, rate: null });
  });

  it("listEntryAttendance defaults every candidate to null (not recorded) before the DM marks anything", () => {
    const { dm, campaign, p1, p2 } = setupParty("att3");
    const entry = createEntry(campaign.id, dm.id, "We fought the goblins.");
    const summary = listEntryAttendance(entry.id);
    const byUser = new Map(summary.map((s) => [s.userId, s]));
    expect(byUser.get(p1.id)?.attended).toBeNull();
    expect(byUser.get(p2.id)?.attended).toBeNull();
    expect(byUser.size).toBe(2);
  });

  it("the DM records who attended, and it's reflected per-entry and in the aggregate stat", () => {
    const { dm, campaign, p1, p2 } = setupParty("att4");
    const entry = createEntry(campaign.id, dm.id, "We fought the goblins.");

    setEntryAttendance(entry.id, dm.id, [
      { userId: p1.id, attended: true },
      { userId: p2.id, attended: false },
    ]);

    const summary = listEntryAttendance(entry.id);
    const byUser = new Map(summary.map((s) => [s.userId, s]));
    expect(byUser.get(p1.id)?.attended).toBe(true);
    expect(byUser.get(p2.id)?.attended).toBe(false);

    expect(getAttendanceStats(p1.id)).toEqual({ recorded: 1, attended: 1, rate: 1 });
    expect(getAttendanceStats(p2.id)).toEqual({ recorded: 1, attended: 0, rate: 0 });
  });

  it("a second call fully replaces the previous attendance record rather than merging", () => {
    const { dm, campaign, p1, p2 } = setupParty("att5");
    const entry = createEntry(campaign.id, dm.id, "Session one recap.");

    setEntryAttendance(entry.id, dm.id, [
      { userId: p1.id, attended: true },
      { userId: p2.id, attended: true },
    ]);
    setEntryAttendance(entry.id, dm.id, [{ userId: p1.id, attended: false }]);

    const summary = listEntryAttendance(entry.id);
    const byUser = new Map(summary.map((s) => [s.userId, s]));
    expect(byUser.get(p1.id)?.attended).toBe(false);
    // p2 dropped out of the replaced set entirely -- back to "not recorded".
    expect(byUser.get(p2.id)?.attended).toBeNull();
  });

  it("averages attendance across multiple entries", () => {
    const { dm, campaign, p1 } = setupParty("att6");
    const e1 = createEntry(campaign.id, dm.id, "Session 1");
    const e2 = createEntry(campaign.id, dm.id, "Session 2");
    const e3 = createEntry(campaign.id, dm.id, "Session 3");
    setEntryAttendance(e1.id, dm.id, [{ userId: p1.id, attended: true }]);
    setEntryAttendance(e2.id, dm.id, [{ userId: p1.id, attended: true }]);
    setEntryAttendance(e3.id, dm.id, [{ userId: p1.id, attended: false }]);

    expect(getAttendanceStats(p1.id)).toEqual({ recorded: 3, attended: 2, rate: 2 / 3 });
  });

  it("an entry the DM never marks attendance for doesn't count against anyone", () => {
    const { dm, campaign, p1 } = setupParty("att7");
    const marked = createEntry(campaign.id, dm.id, "Marked session");
    createEntry(campaign.id, dm.id, "Unmarked session");
    setEntryAttendance(marked.id, dm.id, [{ userId: p1.id, attended: true }]);

    expect(getAttendanceStats(p1.id)).toEqual({ recorded: 1, attended: 1, rate: 1 });
  });

  it("rejects recording attendance from a non-DM active member", () => {
    const { dm, campaign, p1, p2 } = setupParty("att8");
    const entry = createEntry(campaign.id, dm.id, "Session recap.");
    expect(() =>
      setEntryAttendance(entry.id, p1.id, [{ userId: p2.id, attended: true }])
    ).toThrow(AttendanceError);
  });

  it("rejects recording attendance from a stranger with no relationship to the campaign", () => {
    const { dm, campaign, p1 } = setupParty("att9");
    const entry = createEntry(campaign.id, dm.id, "Session recap.");
    const stranger = signUp("Stranger", "att9-s@example.com", "testpassword123");
    expect(() =>
      setEntryAttendance(entry.id, stranger.id, [{ userId: p1.id, attended: true }])
    ).toThrow(AttendanceError);
  });

  it("rejects a userId that isn't a current active-party candidate", () => {
    const { dm, campaign } = setupParty("att10");
    const entry = createEntry(campaign.id, dm.id, "Session recap.");
    const stranger = signUp("Stranger", "att10-s@example.com", "testpassword123");
    expect(() =>
      setEntryAttendance(entry.id, dm.id, [{ userId: stranger.id, attended: true }])
    ).toThrow(AttendanceError);
    // The DM themselves is excluded from the candidate set too.
    expect(() =>
      setEntryAttendance(entry.id, dm.id, [{ userId: dm.id, attended: true }])
    ).toThrow(AttendanceError);
  });

  it("rejects an unknown entry id for both listing and setting", () => {
    const { dm, p1 } = setupParty("att11");
    expect(() => listEntryAttendance("nope")).toThrow(AttendanceError);
    expect(() =>
      setEntryAttendance("nope", dm.id, [{ userId: p1.id, attended: true }])
    ).toThrow(AttendanceError);
  });

  it("a member who has since left the party drops out of the candidate list but keeps their historical attendance record", () => {
    const { dm, campaign, p1, p2 } = setupParty("att12");
    const entry = createEntry(campaign.id, dm.id, "Session recap.");
    setEntryAttendance(entry.id, dm.id, [
      { userId: p1.id, attended: true },
      { userId: p2.id, attended: true },
    ]);

    leaveCampaign(campaign.id, p1.id);

    expect(attendanceCandidates(campaign.id)).not.toContain(p1.id);
    // The already-recorded historical stat for p1 is untouched.
    expect(getAttendanceStats(p1.id)).toEqual({ recorded: 1, attended: 1, rate: 1 });
  });

  it("per-user isolation: one user's recorded attendance doesn't affect another's stats", () => {
    const { dm, campaign, p1, p2 } = setupParty("att13");
    const entry = createEntry(campaign.id, dm.id, "Session recap.");
    setEntryAttendance(entry.id, dm.id, [{ userId: p1.id, attended: true }]);

    expect(getAttendanceStats(p1.id).recorded).toBe(1);
    expect(getAttendanceStats(p2.id)).toEqual({ recorded: 0, attended: 0, rate: null });
  });

  it("deduplicates a repeated userId in the submitted records, keeping the first value", () => {
    const { dm, campaign, p1 } = setupParty("att14");
    const entry = createEntry(campaign.id, dm.id, "Session recap.");
    setEntryAttendance(entry.id, dm.id, [
      { userId: p1.id, attended: true },
      { userId: p1.id, attended: false },
    ]);
    const summary = listEntryAttendance(entry.id);
    expect(summary.find((s) => s.userId === p1.id)?.attended).toBe(true);
  });
});
