import { describe, it, expect } from "vitest";
import {
  escapeIcsText,
  foldIcsLine,
  formatIcsUtc,
  buildSessionIcs,
  DEFAULT_SESSION_DURATION_MINUTES,
} from "@/lib/calendarExport";

describe("escapeIcsText", () => {
  it("escapes backslashes, semicolons, commas, and newlines", () => {
    expect(escapeIcsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("escapes a literal backslash before the other characters, so it doesn't double-escape", () => {
    expect(escapeIcsText("a\\;b")).toBe("a\\\\\\;b");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeIcsText("Curse of Strahd")).toBe("Curse of Strahd");
  });
});

describe("foldIcsLine", () => {
  it("leaves a short line untouched", () => {
    const line = "SUMMARY:Short title";
    expect(foldIcsLine(line)).toBe(line);
  });

  it("folds a line over 75 octets with a leading-space continuation", () => {
    const long = "DESCRIPTION:" + "x".repeat(100);
    const folded = foldIcsLine(long);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].length).toBe(75);
    expect(parts[1].startsWith(" ")).toBe(true);
    // Rejoining (stripping the CRLF + leading space) must reproduce the original.
    const rejoined = parts[0] + parts.slice(1).map((p) => p.slice(1)).join("");
    expect(rejoined).toBe(long);
  });
});

describe("formatIcsUtc", () => {
  it("formats an ISO instant as YYYYMMDDTHHMMSSZ", () => {
    expect(formatIcsUtc("2026-09-12T19:00:00.000Z")).toBe("20260912T190000Z");
  });

  it("strips sub-second precision", () => {
    expect(formatIcsUtc("2026-01-05T03:04:05.789Z")).toBe("20260105T030405Z");
  });
});

describe("buildSessionIcs", () => {
  const base = {
    campaignId: "camp-1",
    title: "Curse of Strahd",
    system: "D&D 5e",
    location: "",
    sessionFormat: null as const,
    nextSessionAt: "2026-09-12T19:00:00.000Z",
    viewerRsvp: null,
  };

  it("produces a well-formed VCALENDAR/VEVENT document with CRLF line endings", () => {
    const ics = buildSessionIcs(base);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("END:VEVENT\r\n");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0\r\n");
  });

  it("sets DTSTART to the session time and DTEND the default duration later", () => {
    const ics = buildSessionIcs(base);
    expect(ics).toContain("DTSTART:20260912T190000Z");
    const end = new Date(
      new Date(base.nextSessionAt).getTime() + DEFAULT_SESSION_DURATION_MINUTES * 60000
    );
    expect(ics).toContain(`DTEND:${formatIcsUtc(end.toISOString())}`);
  });

  it("includes the campaign title and system in the summary and description", () => {
    const ics = buildSessionIcs(base);
    expect(ics).toContain("SUMMARY:Curse of Strahd - Session");
    expect(ics).toContain("Curse of Strahd (D&D 5e)");
  });

  it("notes when the viewer hasn't RSVPed", () => {
    const ics = buildSessionIcs(base);
    expect(ics).toContain("You haven't RSVP");
  });

  it("includes the viewer's RSVP response when they've answered", () => {
    const confirmed = buildSessionIcs({ ...base, viewerRsvp: "confirmed" });
    expect(confirmed).toContain("Your RSVP: Confirmed");
    const declined = buildSessionIcs({ ...base, viewerRsvp: "declined" });
    expect(declined).toContain("Your RSVP: Declined");
  });

  it("uses the campaign's explicit location when set", () => {
    const ics = buildSessionIcs({ ...base, location: "Austin, TX" });
    expect(ics).toContain("LOCATION:Austin\\, TX");
  });

  it("falls back to 'Online/Remote' when unset and the session format is remote", () => {
    const ics = buildSessionIcs({ ...base, location: "", sessionFormat: "remote" });
    expect(ics).toContain("LOCATION:Online/Remote");
  });

  it("omits LOCATION entirely when there's no location and no remote format", () => {
    const ics = buildSessionIcs({ ...base, location: "", sessionFormat: null });
    expect(ics).not.toContain("LOCATION:");
  });

  it("gives the same session a stable UID across two exports of the same date", () => {
    const a = buildSessionIcs(base);
    const b = buildSessionIcs(base);
    const uidA = a.match(/UID:(.+)/)?.[1];
    const uidB = b.match(/UID:(.+)/)?.[1];
    expect(uidA).toBeDefined();
    expect(uidA).toBe(uidB);
  });

  it("produces a different UID when the session is rescheduled to a different instant", () => {
    const a = buildSessionIcs(base);
    const b = buildSessionIcs({ ...base, nextSessionAt: "2026-09-19T19:00:00.000Z" });
    const uidA = a.match(/UID:(.+)/)?.[1];
    const uidB = b.match(/UID:(.+)/)?.[1];
    expect(uidA).not.toBe(uidB);
  });

  it("escapes a comma in the campaign title inside SUMMARY", () => {
    const ics = buildSessionIcs({ ...base, title: "Waterdeep, Dragon Heist" });
    expect(ics).toContain("SUMMARY:Waterdeep\\, Dragon Heist - Session");
  });
});
