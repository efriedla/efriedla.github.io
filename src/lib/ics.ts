/**
 * RFC 5545 iCalendar generation.
 *
 * A calendar QR is unforgiving: a malformed event either fails to import or,
 * worse, imports at the wrong time and looks fine. The rules below are the ones
 * a hand-rolled `BEGIN:VCALENDAR…` string usually gets wrong.
 */

/** TEXT values escape backslash, semicolon, comma and newline (§3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Content lines are folded at 75 octets, continuations prefixed with a space
 * (§3.1). The limit is octets, not characters, so folding counts UTF-8 bytes
 * and never splits one across lines.
 */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let start = 0;
  let limit = 75;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never cut mid-character: continuation bytes are 10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
      end--;
    }
    out.push(new TextDecoder().decode(bytes.subarray(start, end)));
    start = end;
    limit = 74; // continuation lines carry a leading space
  }

  return out.join("\r\n ");
}

/** `20260915T143000Z` */
export function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** `20260915T143000` — a floating time, deliberately without a zone. */
export function formatFloating(wall: string): string {
  const m = wall.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error(`Not a datetime-local value: ${wall}`);
  const [, y, mo, d, h, mi] = m;
  return `${y}${mo}${d}T${h}${mi}00`;
}

/** Milliseconds the zone is ahead of UTC at a given instant. */
function offsetAt(instant: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const { type, value } of dtf.formatToParts(new Date(instant))) {
    if (type !== "literal") p[type] = Number(value);
  }
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return asUtc - instant;
}

/**
 * A `datetime-local` input is wall time with no zone attached. Reading it as
 * UTC — appending `Z` to the typed digits — shifts every event by the zone's
 * offset, which is how a 2:30 PM appointment becomes 7:30 AM.
 */
export function zonedWallTimeToUtc(wall: string, timeZone: string): Date {
  const m = wall.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error(`Not a datetime-local value: ${wall}`);
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  const asIfUtc = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  // One refinement pass settles the DST-boundary cases, where the offset at
  // the guessed instant differs from the offset at the true instant.
  let guess = asIfUtc - offsetAt(asIfUtc, timeZone);
  guess = asIfUtc - offsetAt(guess, timeZone);
  return new Date(guess);
}

export type CalendarEvent = {
  title: string;
  /** `datetime-local` wall time, e.g. "2026-09-15T14:30". */
  start: string;
  end?: string;
  /** IANA zone, or "floating" to let each device read it as its own local time. */
  timeZone: string;
  location?: string;
  description?: string;
  url?: string;
  /** Minutes before the start to alert. Omit for no alarm. */
  reminderMinutes?: number;
};

/** Stable across renders for the same event, so re-scanning updates rather
 *  than duplicating; unique across different events. */
function uid(event: CalendarEvent): string {
  const seed = `${event.title}|${event.start}|${event.end ?? ""}|${event.location ?? ""}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${(h >>> 0).toString(36)}@qr.efriedla.github.io`;
}

export function buildIcs(event: CalendarEvent, now = new Date()): string {
  const floating = event.timeZone === "floating";
  const stamp = (wall: string) =>
    floating ? formatFloating(wall) : formatUtc(zonedWallTimeToUtc(wall, event.timeZone));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    // PRODID is REQUIRED (§3.6). Outlook is the strictest about this.
    "PRODID:-//efriedla//QR Maker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    // UID and DTSTAMP are REQUIRED. Without them clients may silently drop
    // the event or import a duplicate on every scan.
    `UID:${uid(event)}`,
    `DTSTAMP:${formatUtc(now)}`,
    `SUMMARY:${escapeText(event.title || "Event")}`,
    `DTSTART:${stamp(event.start)}`,
  ];

  if (event.end) lines.push(`DTEND:${stamp(event.end)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.url) lines.push(`URL:${event.url}`);

  if (event.reminderMinutes != null && event.reminderMinutes > 0) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(event.title || "Event")}`,
      `TRIGGER:-PT${Math.round(event.reminderMinutes)}M`,
      "END:VALARM",
    );
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  // CRLF is required (§3.1). Some parsers tolerate bare LF; Outlook does not.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
