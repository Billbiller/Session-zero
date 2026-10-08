import { describe, it, expect } from "vitest";
import { formatResponseTime } from "@/lib/responsivenessCopy";

describe("formatResponseTime (backlog #73)", () => {
  it("reads as 'Under 1 hour' for anything under an hour", () => {
    expect(formatResponseTime(0)).toBe("Under 1 hour");
    expect(formatResponseTime(0.5)).toBe("Under 1 hour");
    expect(formatResponseTime(0.99)).toBe("Under 1 hour");
  });

  it("rounds to whole hours, singular at exactly 1", () => {
    expect(formatResponseTime(1)).toBe("1 hour");
    expect(formatResponseTime(1.4)).toBe("1 hour");
    expect(formatResponseTime(5.6)).toBe("6 hours");
    expect(formatResponseTime(23.4)).toBe("23 hours");
  });

  it("switches to days at 24 hours and up, singular at exactly 1 day", () => {
    expect(formatResponseTime(24)).toBe("1 day");
    expect(formatResponseTime(30)).toBe("1 day");
    expect(formatResponseTime(48)).toBe("2 days");
    expect(formatResponseTime(100)).toBe("4 days");
  });
});
