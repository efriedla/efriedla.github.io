import type { CalendarEvent } from "./ics";
import { formatUtc, zonedWallTimeToUtc } from "./ics";

/**
 * Calendar handoff by URL rather than by payload.
 *
 * A QR holding a raw VEVENT is only as good as the scanner reading it: a
 * dedicated scanner app will offer "add to calendar", but a phone's built-in
 * camera may just show the text. Every camera opens a URL, so encoding a
 * prefilled calendar link trades a little vendor flavour for working
 * everywhere.
 */

function range(event: CalendarEvent): string {
  const toUtc = (wall: string) =>
    formatUtc(
      zonedWallTimeToUtc(
        wall,
        event.timeZone === "floating"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : event.timeZone,
      ),
    );
  // Google requires an end; a bare start is rejected. Default to one hour.
  const start = toUtc(event.start);
  const end = event.end
    ? toUtc(event.end)
    : formatUtc(
        new Date(
          zonedWallTimeToUtc(
            event.start,
            event.timeZone === "floating"
              ? Intl.DateTimeFormat().resolvedOptions().timeZone
              : event.timeZone,
          ).getTime() + 3_600_000,
        ),
      );
  return `${start}/${end}`;
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title || "Event",
    dates: range(event),
  });
  if (event.location) p.set("location", event.location);
  if (event.description) p.set("details", event.description);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export function outlookCalendarUrl(event: CalendarEvent): string {
  const [start, end] = range(event).split("/");
  const iso = (compact: string) =>
    `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15)}Z`;
  const p = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title || "Event",
    startdt: iso(start!),
    enddt: iso(end!),
  });
  if (event.location) p.set("location", event.location);
  if (event.description) p.set("body", event.description);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`;
}
