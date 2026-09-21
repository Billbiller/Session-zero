import { describe, it, expect } from "vitest";
import { seatsLeftLabel } from "@/lib/campaignCardCopy";

describe("seatsLeftLabel (backlog #66)", () => {
  it("pluralizes normally for more than one seat left", () => {
    expect(seatsLeftLabel(4, 6)).toBe("2 seats left");
    expect(seatsLeftLabel(0, 6)).toBe("6 seats left");
  });

  it("uses singular phrasing for exactly one seat left", () => {
    expect(seatsLeftLabel(5, 6)).toBe("1 seat left");
  });

  it("returns 'Full' when headcount meets capacity", () => {
    expect(seatsLeftLabel(6, 6)).toBe("Full");
  });

  it("returns 'Full' rather than a negative count when headcount exceeds capacity", () => {
    // Defensive case -- shouldn't happen in practice (capacity is a
    // floor-checked max), but the copy shouldn't ever read "−1 seats left".
    expect(seatsLeftLabel(7, 6)).toBe("Full");
  });

  it("handles a single-seat campaign", () => {
    expect(seatsLeftLabel(0, 1)).toBe("1 seat left");
    expect(seatsLeftLabel(1, 1)).toBe("Full");
  });
});
