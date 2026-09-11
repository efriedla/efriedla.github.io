"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { buildIcs, type CalendarEvent } from "@/lib/ics";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar-links";

const subscribeNever = () => () => {};

/**
 * Type an address with a comma in it and watch the escaping happen, then scan
 * the code beside it. The failure modes are invisible in a finished QR and
 * obvious in the payload, so the playground shows both at once.
 */
export function IcsPlayground({ variant }: { variant: "ics" | "links" }) {
  const [title, setTitle] = useState("Teeth cleaning");
  const [start, setStart] = useState("2026-09-15T14:30");
  const [end, setEnd] = useState("2026-09-15T15:15");
  const [location, setLocation] = useState("123 Main St, Suite 4");

  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const zone = mounted ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

  const codes = useMemo(() => {
    if (!zone) return null;
    const event: CalendarEvent = { title, start, end, location, timeZone: zone };
    if (variant === "ics") {
      return [{ label: "Event payload", payload: buildIcs(event) }];
    }
    return [
      { label: "Google Calendar", payload: googleCalendarUrl(event) },
      { label: "Outlook", payload: outlookCalendarUrl(event) },
    ];
  }, [variant, title, start, end, location, zone]);

  const icsHref = useMemo(() => {
    if (variant !== "ics" || !codes) return null;
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(codes[0]!.payload)}`;
  }, [variant, codes]);

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
        Read in {zone ?? "this device’s zone"} and converted to UTC — the digits
        you typed are not the digits that come out, and that is the point. Scan a
        code and the event should land at the time you entered.
      </p>

      <div className="mt-4 grid gap-4">
        {(codes ?? []).map((c) => (
          <div
            key={c.label}
            className="grid gap-4 rounded-lg border border-line p-3 sm:grid-cols-[auto_1fr]"
          >
            <div className="grid justify-items-center gap-1.5">
              <div className="rounded-md bg-white p-2.5">
                <QRCodeCanvas
                  value={c.payload}
                  size={148}
                  level="M"
                  marginSize={2}
                  aria-label={`${c.label} QR code`}
                />
              </div>
              <p className="m-0 text-[0.6875rem] text-ink-faint">
                {c.label} · {new TextEncoder().encode(c.payload).length} bytes
              </p>
            </div>

            <pre
              aria-label={`${c.label} output`}
              tabIndex={0}
              className="m-0 max-h-52 overflow-auto rounded-md bg-bg-sunken p-3 font-mono text-[0.6875rem] leading-relaxed"
            >
              <code>{c.payload}</code>
            </pre>
          </div>
        ))}
        {!codes && <p className="m-0 text-sm text-ink-faint">Preparing…</p>}
      </div>

      {icsHref && (
        <p className="mt-3 mb-0">
          <a
            href={icsHref}
            download="event.ics"
            className="text-sm text-accent no-underline"
          >
            Download event.ics →
          </a>
        </p>
      )}
    </div>
  );
}
