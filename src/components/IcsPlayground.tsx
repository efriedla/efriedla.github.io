"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { buildIcs, type CalendarEvent } from "@/lib/ics";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar-links";

const subscribeNever = () => () => {};

/**
 * Type an address with a comma in it and watch the escaping happen. The point
 * of a playground here is that the failure modes are invisible in a finished
 * QR code but obvious in the payload.
 */
export function IcsPlayground({ variant }: { variant: "ics" | "links" }) {
  const [title, setTitle] = useState("Teeth cleaning");
  const [start, setStart] = useState("2026-09-15T14:30");
  const [end, setEnd] = useState("2026-09-15T15:15");
  const [location, setLocation] = useState("123 Main St, Suite 4");

  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const zone = mounted ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

  const output = useMemo(() => {
    if (!zone) return null;
    const event: CalendarEvent = { title, start, end, location, timeZone: zone };
    if (variant === "ics") return buildIcs(event);
    return `${googleCalendarUrl(event)}\n\n${outlookCalendarUrl(event)}`;
  }, [variant, title, start, end, location, zone]);

  const field =
    "w-full rounded-md border border-line bg-bg-raised px-2.5 py-1.5 text-sm";

  return (
    <div className="border-b border-line px-4 py-4 sm:px-6">
      <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Try it
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-ink-soft">
          Title
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-ink-soft">
          Location — try a comma or semicolon
          <input
            className={field}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-xs text-ink-soft">
          Start
          <input
            type="datetime-local"
            className={field}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-xs text-ink-soft">
          End
          <input
            type="datetime-local"
            className={field}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>

      <p className="mt-3 mb-0 text-xs text-ink-faint">
        Read in {zone ?? "this device’s zone"} and converted to UTC — the
        digits you typed are not the digits that come out, and that is the point.
      </p>

      <pre
        aria-label="Generated output"
        tabIndex={0}
        className="mt-3 mb-0 max-h-56 overflow-auto rounded-lg bg-bg-sunken p-3 font-mono text-[0.6875rem] leading-relaxed"
      >
        <code>{output ?? "…"}</code>
      </pre>
    </div>
  );
}
