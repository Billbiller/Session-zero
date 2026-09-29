import { describe, it, expect } from "vitest";
import {
  projectUpcomingSessions,
  DEFAULT_PROJECTED_SESSION_COUNT,
} from "@/lib/upcomingSessions";

describe("projectUpcomingSessions", () => {
  it("returns an empty list when unscheduled, regardless of recurrence", () => {
    expect(projectUpcomingSessions(null, null)).toEqual([]);
    expect(projectUpcomingSessions(null, "weekly")).toEqual([]);
  });

  it("returns just the one date when there's no recurrence", () => {
    const iso = "2026-10-01T18:00:00.000Z";
    expect(projectUpcomingSessions(iso, null)).toEqual([iso]);
  });

  it("projects weekly dates 7 days apart, including the start date, up to the default count", () => {
    const start = "2026-10-01T18:00:00.000Z";
    const dates = projectUpcomingSessions(start, "weekly");
    expect(dates).toHaveLength(DEFAULT_PROJECTED_SESSION_COUNT);
    expect(dates[0]).toBe(start);
    expect(dates[1]).toBe("2026-10-08T18:00:00.000Z");
    expect(dates[2]).toBe("2026-10-15T18:00:00.000Z");
  });

  it("projects biweekly dates 14 days apart", () => {
    const start = "2026-10-01T18:00:00.000Z";
    const dates = projectUpcomingSessions(start, "biweekly");
    expect(dates[1]).toBe("2026-10-15T18:00:00.000Z");
    expect(dates[2]).toBe("2026-10-29T18:00:00.000Z");
  });

  it("respects a custom count", () => {
    const start = "2026-10-01T18:00:00.000Z";
    expect(projectUpcomingSessions(start, "weekly", 2)).toHaveLength(2);
    expect(projectUpcomingSessions(start, "weekly", 1)).toEqual([start]);
  });

  it("degrades to the single date on a non-positive or non-integer count instead of throwing", () => {
    const start = "2026-10-01T18:00:00.000Z";
    expect(projectUpcomingSessions(start, "weekly", 0)).toEqual([start]);
    expect(projectUpcomingSessions(start, "weekly", -3)).toEqual([start]);
    expect(projectUpcomingSessions(start, "weekly", 1.5)).toEqual([start]);
  });

  it("degrades to an empty list on an unparseable date rather than throwing", () => {
    expect(projectUpcomingSessions("not-a-date", "weekly")).toEqual([]);
  });

  it("is pure UTC-instant arithmetic, unaffected by the runner's local timezone", () => {
    // Spans a US DST transition (2026-03-08); if this were computed via
    // local-calendar-day arithmetic instead of raw instants, the 7-day
    // spacing would drift by an hour across the transition.
    const start = "2026-03-08T02:30:00.000Z";
    const dates = projectUpcomingSessions(start, "weekly", 3);
    expect(dates).toEqual([
      "2026-03-08T02:30:00.000Z",
      "2026-03-15T02:30:00.000Z",
      "2026-03-22T02:30:00.000Z",
    ]);
  });
});
