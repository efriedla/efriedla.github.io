"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { buildIcs, type CalendarEvent } from "@/lib/ics";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar-links";

/**
 * A scan test, not a product. The question it settles: does a phone's built-in
 * camera do anything useful with a raw VEVENT payload, or does it only show
 * the text? That decides whether the calendar tool encodes an event or a link.
 */
/** No external store to watch: the value only changes from server to client. */
const subscribeNever = () => () => {};

export function QrScanTest() {
  const [title, setTitle] = useState("Interview");
  const [start, setStart] = useState("2026-09-15T14:30");
  const [end, setEnd] = useState("2026-09-15T15:15");
  const [location, setLocation] = useState("123 Main St, Suite 4");

  // The device's zone and locale are only knowable in the browser. Reading
  // them during render would make the prerendered HTML disagree with the
  // client, so the snapshot is false on the server and true once mounted, and
  // everything derived from them waits for that.
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const zone = mounted ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

  const candidates = useMemo(() => {
    if (!zone) return null;
    const event: CalendarEvent = { title, start, end, location, timeZone: zone };
    return [
      {
        key: "ics",
        label: "Raw VEVENT",
        expect: "A scanner app should offer “add to calendar”. A phone camera may only show text.",
        payload: buildIcs(event),
      },
      {
        key: "google",
        label: "Google Calendar link",
        expect: "Any camera should open a prefilled Google Calendar event.",
        payload: googleCalendarUrl(event),
      },
      {
        key: "outlook",
        label: "Outlook link",
        expect: "Any camera should open a prefilled Outlook event.",
        payload: outlookCalendarUrl(event),
      },
    ];
  }, [title, start, end, location, zone]);

  const readable = useMemo(() => {
    if (!mounted) return null;
    const d = new Date(start);
    return Number.isNaN(d.getTime())
      ? null
      : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }, [mounted, start]);

  const field = "w-full rounded-md border border-line bg-bg-raised px-2.5 py-1.5 text-sm";

  return (
    <div>
      <div className="grid gap-3 rounded-xl border border-line bg-bg-raised p-4 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-ink-soft">
          Title
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-ink-soft">
          Location
          <input className={field} value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-ink-soft">
          Start
          <input type="datetime-local" className={field} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-ink-soft">
          End
          <input type="datetime-local" className={field} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <p className="m-0 text-xs text-ink-faint sm:col-span-2">
          Times are read in{" "}
          <strong className="font-medium text-ink-soft">{zone ?? "this device’s zone"}</strong>.
          Scanning should show{" "}
          <strong className="font-medium text-ink-soft">{readable ?? "the time you entered"}</strong>{" "}
          — if a calendar opens at a different time, the zone handling is wrong.
        </p>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        {(candidates ?? []).map((c) => (
          <section key={c.key} className="rounded-xl border border-line bg-bg-raised p-4">
            <h2 className="m-0 text-sm font-semibold">{c.label}</h2>
            <p className="mt-1 mb-3 text-xs leading-relaxed text-ink-faint">{c.expect}</p>
            <div className="grid place-items-center rounded-lg bg-white p-3">
              <QRCodeCanvas
                value={c.payload}
                size={200}
                level="M"
                marginSize={2}
                aria-label={`${c.label} test code`}
              />
            </div>
            <p className="mt-2 mb-0 text-[0.6875rem] text-ink-faint">
              {new TextEncoder().encode(c.payload).length} bytes
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-ink-soft">Payload</summary>
              <pre className="mt-2 mb-0 max-h-40 overflow-auto rounded bg-bg-sunken p-2 font-mono text-[0.6875rem] leading-relaxed">
                <code>{c.payload}</code>
              </pre>
            </details>
          </section>
        ))}
      </div>
    </div>
  );
}
