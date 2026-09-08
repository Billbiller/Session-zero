import type { Campaign, RsvpResponse } from "./types";

/** This app has no per-campaign session-duration field anywhere (see
 * backlog #18's own "no session-duration data" note) -- the exported
 * event's DTEND is derived from this fixed default rather than left
 * out entirely, since omitting DTEND makes most calendar apps render
 * the event as an all-day block instead of a timed one. A plain
 * fallback beats a fabricated per-campaign guess. */
export const DEFAULT_SESSION_DURATION_MINUTES = 180;

/** RFC 5545 TEXT value escaping: a literal backslash, semicolon, comma,
 * or newline all need a leading backslash. The backslash itself must be
 * escaped first so the later replacements don't double-escape it. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** RFC 5545 line folding: a content line over 75 octets must be split
 * across physical lines, each continuation starting with a single
 * leading space (which itself counts toward that line's 75). Most
 * calendar apps tolerate long unfolded lines in practice, but folding
 * is cheap and keeps this a genuinely spec-compliant file rather than
 * one that merely happens to work in the apps this was tested against. */
export function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

/** Formats an ISO timestamp as a UTC ICS DATE-TIME (YYYYMMDDTHHMMSSZ). */
export function formatIcsUtc(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

const RSVP_LABELS: Record<RsvpResponse, string> = {
  confirmed: "Confirmed",
  declined: "Declined",
};

/** Builds a full single-event .ics calendar document (RFC 5545) for a
 * campaign's currently scheduled next session. Pure and DB-free by
 * design -- it takes plain values rather than a live Campaign row, so
 * the route handler (app/api/campaigns/[id]/calendar/route.ts) is the
 * only place that does access-checking and DB reads; this function only
 * formats what it's given. Caller must have already confirmed
 * nextSessionAt is non-null (there's nothing to export otherwise). */
export function buildSessionIcs(params: {
  campaignId: string;
  title: string;
  system: string;
  location: string;
  sessionFormat: Campaign["session_format"];
  nextSessionAt: string;
  viewerRsvp: RsvpResponse | null;
}): string {
  const { campaignId, title, system, location, sessionFormat, nextSessionAt, viewerRsvp } = params;
  const start = new Date(nextSessionAt);
  const end = new Date(start.getTime() + DEFAULT_SESSION_DURATION_MINUTES * 60000);
  const dtstamp = formatIcsUtc(new Date().toISOString());

  // A UID keyed on (campaign, exact session instant) means re-downloading
  // the same still-scheduled session updates the existing calendar entry
  // in an app that dedupes by UID, rather than creating a duplicate every
  // time someone re-exports -- but a reschedule (a different instant)
  // produces a genuinely new UID, so an old entry an importer already
  // holds doesn't silently get confused with the new date.
  const uid = `campaign-${campaignId}-session-${start.getTime()}@session-zero`;

  const effectiveLocation = location || (sessionFormat === "remote" ? "Online/Remote" : "");

  const descriptionLines = [
    `${title} (${system})`,
    viewerRsvp ? `Your RSVP: ${RSVP_LABELS[viewerRsvp]}` : "You haven't RSVP'd yet.",
  ];

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Session Zero//Campaign Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${formatIcsUtc(start.toISOString())}`,
    `DTEND:${formatIcsUtc(end.toISOString())}`,
    `SUMMARY:${escapeIcsText(`${title} - Session`)}`,
    ...(effectiveLocation ? [`LOCATION:${escapeIcsText(effectiveLocation)}`] : []),
    `DESCRIPTION:${escapeIcsText(descriptionLines.join("\n"))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
