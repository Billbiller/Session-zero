// Fixed before any Date is constructed in this file, so every localDayAndHour
// call below is deterministic regardless of the machine running the test
// suite -- the sandbox this project builds in defaults to America/Los_Angeles
// (see lib/availabilityMatch.ts's own doc comment for why the *real* feature
// deliberately depends on the browser's local timezone; the test just needs
// one fixed timezone to assert against).
process.env.TZ = "UTC";

import { describe, it, expect } from "vitest";
import { AVAILABILITY_DAYS } from "@/lib/types";
import {
  appDayFromJsDay,
  localDayAndHour,
  matchesAvailability,
} from "@/lib/availabilityMatch";

describe("appDayFromJsDay (backlog #27 phase 2)", () => {
  it("maps every JS Date.getDay() value to this app's Monday-first index", () => {
    // JS: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
    // App (AVAILABILITY_DAYS): 0=Mon,1=Tue,2=Wed,3=Thu,4=Fri,5=Sat,6=Sun
    expect(appDayFromJsDay(0)).toBe(6); // Sunday
    expect(appDayFromJsDay(1)).toBe(0); // Monday
    expect(appDayFromJsDay(2)).toBe(1); // Tuesday
    expect(appDayFromJsDay(3)).toBe(2); // Wednesday
    expect(appDayFromJsDay(4)).toBe(3); // Thursday
    expect(appDayFromJsDay(5)).toBe(4); // Friday
    expect(appDayFromJsDay(6)).toBe(5); // Saturday
  });

  it("agrees with AVAILABILITY_DAYS' own ordering for every day name", () => {
    const jsDayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    for (let jsDay = 0; jsDay < 7; jsDay++) {
      expect(AVAILABILITY_DAYS[appDayFromJsDay(jsDay)]).toBe(jsDayNames[jsDay]);
    }
  });
});

describe("localDayAndHour (backlog #27 phase 2)", () => {
  it("reads day and hour from an ISO instant in the current (UTC, fixed above) timezone", () => {
    // 2026-09-21 is a Monday.
    expect(localDayAndHour("2026-09-21T18:30:00.000Z")).toEqual({ day: 0, hour: 18 });
  });

  it("handles the Sunday/Monday boundary correctly", () => {
    // 2026-09-20 is a Sunday.
    expect(localDayAndHour("2026-09-20T23:00:00.000Z")).toEqual({ day: 6, hour: 23 });
    // One hour later rolls into Monday 0:00.
    expect(localDayAndHour("2026-09-21T00:00:00.000Z")).toEqual({ day: 0, hour: 0 });
  });

  it("truncates to the containing hour, not just an exact match", () => {
    expect(localDayAndHour("2026-09-21T18:59:59.000Z")).toEqual({ day: 0, hour: 18 });
  });
});

describe("matchesAvailability (backlog #27 phase 2)", () => {
  const grid = [
    { day: 0, hour: 18 }, // Monday 6pm
    { day: 0, hour: 19 }, // Monday 7pm
    { day: 5, hour: 20 }, // Saturday 8pm
  ];

  it("returns null (unknown) for an unscheduled campaign", () => {
    expect(matchesAvailability(null, grid)).toBeNull();
  });

  it("returns null (unknown) for a viewer with no saved grid", () => {
    expect(matchesAvailability("2026-09-21T18:30:00.000Z", [])).toBeNull();
  });

  it("returns true when the session's local day+hour is marked free", () => {
    // Monday 6:30pm UTC falls in the Monday 6pm hour cell.
    expect(matchesAvailability("2026-09-21T18:30:00.000Z", grid)).toBe(true);
  });

  it("returns false when the session's local day+hour is not marked free", () => {
    // Monday 5pm UTC -- adjacent to, but not inside, the saved 6-8pm range.
    expect(matchesAvailability("2026-09-21T17:00:00.000Z", grid)).toBe(false);
  });

  it("returns false for a session on a day with no saved availability at all", () => {
    // 2026-09-23 is a Wednesday; the grid has nothing on Wednesday.
    expect(matchesAvailability("2026-09-23T18:30:00.000Z", grid)).toBe(false);
  });

  it("matches an exact hour boundary on the saved Saturday slot", () => {
    // 2026-09-26 is a Saturday.
    expect(matchesAvailability("2026-09-26T20:00:00.000Z", grid)).toBe(true);
    expect(matchesAvailability("2026-09-26T21:00:00.000Z", grid)).toBe(false);
  });
});
