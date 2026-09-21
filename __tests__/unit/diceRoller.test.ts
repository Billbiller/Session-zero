import { describe, it, expect } from "vitest";
import {
  parseDiceNotation,
  rollDice,
  rollNotation,
  formatDiceNotation,
  MAX_DICE_COUNT,
  MAX_DICE_SIDES,
} from "@/lib/diceRoller";

describe("parseDiceNotation (backlog #62)", () => {
  it("parses a full NdS+M expression", () => {
    expect(parseDiceNotation("2d6+3")).toEqual({ count: 2, sides: 6, modifier: 3 });
  });

  it("parses a negative modifier", () => {
    expect(parseDiceNotation("4d8-2")).toEqual({ count: 4, sides: 8, modifier: -2 });
  });

  it("defaults count to 1 when omitted", () => {
    expect(parseDiceNotation("d20")).toEqual({ count: 1, sides: 20, modifier: 0 });
  });

  it("defaults modifier to 0 when omitted", () => {
    expect(parseDiceNotation("3d10")).toEqual({ count: 3, sides: 10, modifier: 0 });
  });

  it("is case-insensitive on the 'd' separator", () => {
    expect(parseDiceNotation("2D6")).toEqual({ count: 2, sides: 6, modifier: 0 });
  });

  it("tolerates internal and surrounding whitespace", () => {
    expect(parseDiceNotation("  2 d 6 + 3  ")).toEqual({ count: 2, sides: 6, modifier: 3 });
  });

  it("rejects a non-notation string", () => {
    expect(parseDiceNotation("hello")).toBeNull();
    expect(parseDiceNotation("")).toBeNull();
    expect(parseDiceNotation("6")).toBeNull();
  });

  it("rejects a count of 0", () => {
    expect(parseDiceNotation("0d6")).toBeNull();
  });

  it("rejects a count above MAX_DICE_COUNT", () => {
    expect(parseDiceNotation(`${MAX_DICE_COUNT + 1}d6`)).toBeNull();
    expect(parseDiceNotation(`${MAX_DICE_COUNT}d6`)).not.toBeNull();
  });

  it("rejects sides of 0 or above MAX_DICE_SIDES", () => {
    expect(parseDiceNotation("1d0")).toBeNull();
    expect(parseDiceNotation(`1d${MAX_DICE_SIDES + 1}`)).toBeNull();
    expect(parseDiceNotation(`1d${MAX_DICE_SIDES}`)).not.toBeNull();
  });
});

describe("rollDice (backlog #62)", () => {
  it("rolls exactly `count` dice, each within [1, sides]", () => {
    // rng always returns just under 1, so Math.floor(rng() * sides) + 1
    // deterministically hits the maximum face every time.
    const result = rollDice({ count: 5, sides: 6, modifier: 0 }, () => 0.999999);
    expect(result.rolls).toHaveLength(5);
    expect(result.rolls.every((r) => r === 6)).toBe(true);
  });

  it("hits the minimum face when rng returns 0", () => {
    const result = rollDice({ count: 3, sides: 20, modifier: 0 }, () => 0);
    expect(result.rolls).toEqual([1, 1, 1]);
  });

  it("sums rolls plus modifier into total", () => {
    // Fixed sequence: 0, 0.5, 0.999999 on a d10 -> rolls [1, 6, 10]
    const sequence = [0, 0.5, 0.999999];
    let i = 0;
    const rng = () => sequence[i++];
    const result = rollDice({ count: 3, sides: 10, modifier: 4 }, rng);
    expect(result.rolls).toEqual([1, 6, 10]);
    expect(result.total).toBe(1 + 6 + 10 + 4);
  });

  it("applies a negative modifier", () => {
    const result = rollDice({ count: 1, sides: 20, modifier: -5 }, () => 0.5);
    expect(result.total).toBe(result.rolls[0] - 5);
  });

  it("uses real randomness by default (statistical sanity check, not exact)", () => {
    const result = rollDice({ count: 20, sides: 6, modifier: 0 });
    expect(result.rolls).toHaveLength(20);
    expect(result.rolls.every((r) => r >= 1 && r <= 6)).toBe(true);
  });
});

describe("rollNotation (backlog #62)", () => {
  it("parses and rolls in one call", () => {
    const result = rollNotation("2d6+1", () => 0);
    expect(result).not.toBeNull();
    expect(result!.rolls).toEqual([1, 1]);
    expect(result!.total).toBe(3);
  });

  it("returns null for invalid notation without rolling", () => {
    expect(rollNotation("not dice")).toBeNull();
  });
});

describe("formatDiceNotation (backlog #62)", () => {
  it("formats with an explicit count even when originally shorthand", () => {
    expect(formatDiceNotation({ count: 1, sides: 20, modifier: 0 })).toBe("1d20");
  });

  it("formats a positive modifier with a leading +", () => {
    expect(formatDiceNotation({ count: 2, sides: 6, modifier: 3 })).toBe("2d6+3");
  });

  it("formats a negative modifier without a double sign", () => {
    expect(formatDiceNotation({ count: 4, sides: 8, modifier: -2 })).toBe("4d8-2");
  });

  it("omits the modifier suffix entirely when it's 0", () => {
    expect(formatDiceNotation({ count: 3, sides: 10, modifier: 0 })).toBe("3d10");
  });
});
