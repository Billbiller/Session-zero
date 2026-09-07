import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import {
  getAvailabilitySlots,
  setAvailabilitySlots,
  AvailabilityError,
} from "@/lib/availability";

describe("availability (backlog #27 phase 1)", () => {
  it("returns an empty grid for a brand-new user", () => {
    const user = signUp("Alice", "avail1@example.com", "testpassword123");
    expect(getAvailabilitySlots(user.id)).toEqual([]);
  });

  it("saves a set of slots and reads them back in day-then-block order", () => {
    const user = signUp("Bob", "avail2@example.com", "testpassword123");
    setAvailabilitySlots(user.id, [
      { day: 6, block: "night" },
      { day: 0, block: "evening" },
      { day: 0, block: "morning" },
    ]);
    expect(getAvailabilitySlots(user.id)).toEqual([
      { day: 0, block: "morning" },
      { day: 0, block: "evening" },
      { day: 6, block: "night" },
    ]);
  });

  it("fully replaces the grid on a second save rather than merging", () => {
    const user = signUp("Carol", "avail3@example.com", "testpassword123");
    setAvailabilitySlots(user.id, [{ day: 1, block: "morning" }]);
    setAvailabilitySlots(user.id, [{ day: 2, block: "night" }]);
    expect(getAvailabilitySlots(user.id)).toEqual([{ day: 2, block: "night" }]);
  });

  it("clears the grid when saved with an empty array", () => {
    const user = signUp("Dave", "avail4@example.com", "testpassword123");
    setAvailabilitySlots(user.id, [{ day: 1, block: "morning" }]);
    setAvailabilitySlots(user.id, []);
    expect(getAvailabilitySlots(user.id)).toEqual([]);
  });

  it("de-duplicates repeated day/block pairs instead of erroring", () => {
    const user = signUp("Eve", "avail5@example.com", "testpassword123");
    const result = setAvailabilitySlots(user.id, [
      { day: 3, block: "afternoon" },
      { day: 3, block: "afternoon" },
    ]);
    expect(result).toEqual([{ day: 3, block: "afternoon" }]);
  });

  it("rejects an out-of-range day", () => {
    const user = signUp("Frank", "avail6@example.com", "testpassword123");
    expect(() => setAvailabilitySlots(user.id, [{ day: 7, block: "morning" }])).toThrow(
      AvailabilityError
    );
    expect(() => setAvailabilitySlots(user.id, [{ day: -1, block: "morning" }])).toThrow(
      AvailabilityError
    );
  });

  it("rejects an unrecognized block", () => {
    const user = signUp("Grace", "avail7@example.com", "testpassword123");
    expect(() =>
      // @ts-expect-error intentionally invalid block for the error-path test
      setAvailabilitySlots(user.id, [{ day: 0, block: "midnight" }])
    ).toThrow(AvailabilityError);
  });

  it("keeps each user's grid independent", () => {
    const a = signUp("Heidi", "avail8@example.com", "testpassword123");
    const b = signUp("Ivan", "avail9@example.com", "testpassword123");
    setAvailabilitySlots(a.id, [{ day: 0, block: "morning" }]);
    setAvailabilitySlots(b.id, [{ day: 5, block: "night" }]);
    expect(getAvailabilitySlots(a.id)).toEqual([{ day: 0, block: "morning" }]);
    expect(getAvailabilitySlots(b.id)).toEqual([{ day: 5, block: "night" }]);
  });
});
