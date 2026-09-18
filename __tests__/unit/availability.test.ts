import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import {
  getAvailabilitySlots,
  setAvailabilitySlots,
  formatHourLabel,
  summarizeAvailabilityByDay,
  AvailabilityError,
} from "@/lib/availability";

describe("availability (backlog #27 phase 1; hour granularity added by backlog #57)", () => {
  it("returns an empty grid for a brand-new user", () => {
    const user = signUp("Alice", "avail1@example.com", "testpassword123");
    expect(getAvailabilitySlots(user.id)).toEqual([]);
  });

  it("saves a set of slots and reads them back in day-then-hour order", () => {
    const user = signUp("Bob", "avail2@example.com", "testpassword123");
    setAvailabilitySlots(user.id, [
      { day: 6, hour: 23 },
      { day: 0, hour: 18 },
      { day: 0, hour: 9 },
    ]);
    expect(getAvailabilitySlots(user.id)).toEqual([
      { day: 0, hour: 9 },
      { day: 0, hour: 18 },
      { day: 6, hour: 23 },
    ]);
  });

  it("fully replaces the grid on a second save rather than merging", () => {
    const user = signUp("Carol", "avail3@example.com", "testpassword123");
    setAvailabilitySlots(user.id, [{ day: 1, hour: 8 }]);
    setAvailabilitySlots(user.id, [{ day: 2, hour: 23 }]);
    expect(getAvailabilitySlots(user.id)).toEqual([{ day: 2, hour: 23 }]);
  });

  it("clears the grid when saved with an empty array", () => {
    const user = signUp("Dave", "avail4@example.com", "testpassword123");
    setAvailabilitySlots(user.id, [{ day: 1, hour: 8 }]);
    setAvailabilitySlots(user.id, []);
    expect(getAvailabilitySlots(user.id)).toEqual([]);
  });

  it("de-duplicates repeated day/hour pairs instead of erroring", () => {
    const user = signUp("Eve", "avail5@example.com", "testpassword123");
    const result = setAvailabilitySlots(user.id, [
      { day: 3, hour: 14 },
      { day: 3, hour: 14 },
    ]);
    expect(result).toEqual([{ day: 3, hour: 14 }]);
  });

  it("rejects an out-of-range day", () => {
    const user = signUp("Frank", "avail6@example.com", "testpassword123");
    expect(() => setAvailabilitySlots(user.id, [{ day: 7, hour: 8 }])).toThrow(AvailabilityError);
    expect(() => setAvailabilitySlots(user.id, [{ day: -1, hour: 8 }])).toThrow(AvailabilityError);
  });

  it("rejects an out-of-range or non-integer hour", () => {
    const user = signUp("Grace", "avail7@example.com", "testpassword123");
    expect(() => setAvailabilitySlots(user.id, [{ day: 0, hour: 24 }])).toThrow(AvailabilityError);
    expect(() => setAvailabilitySlots(user.id, [{ day: 0, hour: -1 }])).toThrow(AvailabilityError);
    expect(() => setAvailabilitySlots(user.id, [{ day: 0, hour: 6.5 }])).toThrow(AvailabilityError);
  });

  it("keeps each user's grid independent", () => {
    const a = signUp("Heidi", "avail8@example.com", "testpassword123");
    const b = signUp("Ivan", "avail9@example.com", "testpassword123");
    setAvailabilitySlots(a.id, [{ day: 0, hour: 8 }]);
    setAvailabilitySlots(b.id, [{ day: 5, hour: 23 }]);
    expect(getAvailabilitySlots(a.id)).toEqual([{ day: 0, hour: 8 }]);
    expect(getAvailabilitySlots(b.id)).toEqual([{ day: 5, hour: 23 }]);
  });
});

describe("formatHourLabel", () => {
  it("formats midnight and noon specially", () => {
    expect(formatHourLabel(0)).toBe("12am");
    expect(formatHourLabel(12)).toBe("12pm");
  });

  it("formats every other hour with an am/pm suffix", () => {
    expect(formatHourLabel(1)).toBe("1am");
    expect(formatHourLabel(11)).toBe("11am");
    expect(formatHourLabel(13)).toBe("1pm");
    expect(formatHourLabel(23)).toBe("11pm");
  });

  it("wraps an hour of 24 (an exclusive range end through midnight) to 12am", () => {
    expect(formatHourLabel(24)).toBe("12am");
  });
});

describe("summarizeAvailabilityByDay", () => {
  it("returns nothing for an empty grid", () => {
    expect(summarizeAvailabilityByDay([])).toEqual([]);
  });

  it("collapses a single contiguous run into one range, matching the backlog's own worked example", () => {
    // Tuesday = day 1 (AVAILABILITY_DAYS is Monday-first). Hours 18/19/20
    // = 6pm/7pm/8pm, each hour meaning "free for that one hour" -- so the
    // whole run reads as free from 6pm through 9pm.
    const summary = summarizeAvailabilityByDay([
      { day: 1, hour: 18 },
      { day: 1, hour: 19 },
      { day: 1, hour: 20 },
    ]);
    expect(summary).toEqual([{ day: 1, dayName: "Tuesday", ranges: ["6pm-9pm"] }]);
  });

  it("keeps two separate runs on the same day as two separate ranges", () => {
    const summary = summarizeAvailabilityByDay([
      { day: 0, hour: 6 },
      { day: 0, hour: 7 },
      { day: 0, hour: 18 },
      { day: 0, hour: 19 },
      { day: 0, hour: 20 },
    ]);
    expect(summary[0].ranges).toEqual(["6am-8am", "6pm-9pm"]);
  });

  it("formats a single marked hour as its own one-hour range", () => {
    const summary = summarizeAvailabilityByDay([{ day: 2, hour: 5 }]);
    expect(summary[0].ranges).toEqual(["5am-6am"]);
  });

  it("formats a run ending at the last hour of the day as ending at 12am", () => {
    const summary = summarizeAvailabilityByDay([
      { day: 3, hour: 22 },
      { day: 3, hour: 23 },
    ]);
    expect(summary[0].ranges).toEqual(["10pm-12am"]);
  });

  it("de-duplicates a repeated hour before collapsing into ranges", () => {
    const summary = summarizeAvailabilityByDay([
      { day: 4, hour: 9 },
      { day: 4, hour: 9 },
      { day: 4, hour: 10 },
    ]);
    expect(summary[0].ranges).toEqual(["9am-11am"]);
  });

  it("only includes days with at least one marked hour, in AVAILABILITY_DAYS order regardless of input order", () => {
    const summary = summarizeAvailabilityByDay([
      { day: 6, hour: 10 },
      { day: 0, hour: 8 },
    ]);
    expect(summary.map((d) => d.dayName)).toEqual(["Monday", "Sunday"]);
  });
});
