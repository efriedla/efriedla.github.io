import { describe, expect, it } from "vitest";
import {
  buildIcs,
  escapeText,
  foldLine,
  formatFloating,
  isWallTime,
  zonedWallTimeToUtc,
} from "./ics";

const NOW = new Date("2026-01-01T00:00:00Z");

describe("escapeText", () => {
  it("escapes the four characters RFC 5545 treats as syntax", () => {
    expect(escapeText("123 Main St, Suite 4; Seattle")).toBe(
      "123 Main St\\, Suite 4\\; Seattle",
    );
    expect(escapeText("a\\b")).toBe("a\\\\b");
    expect(escapeText("line one\nline two")).toBe("line one\\nline two");
  });

  it("escapes the backslash before anything else, not after", () => {
    // Getting this order wrong double-escapes the escapes.
    expect(escapeText("50% off\\, today")).toBe("50% off\\\\\\, today");
  });
});

describe("foldLine", () => {
  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:Coffee")).toBe("SUMMARY:Coffee");
  });

  it("folds past 75 octets with a leading space on continuations", () => {
    const folded = foldLine("DESCRIPTION:" + "x".repeat(120));
    const parts = folded.split("\r\n");
    expect(parts.length).toBe(2);
    expect(parts[1]!.startsWith(" ")).toBe(true);
    expect(new TextEncoder().encode(parts[0]!).length).toBeLessThanOrEqual(75);
  });

  it("counts octets, not characters, and never splits one", () => {
    // Emoji are 4 bytes each: 30 of them is 120 octets in only 30 characters.
    const folded = foldLine("SUMMARY:" + "😀".repeat(30));
    expect(folded.split("\r\n").length).toBeGreaterThan(1);
    // A split multi-byte character would decode to U+FFFD.
    expect(folded).not.toContain("�");
  });
});

describe("zonedWallTimeToUtc", () => {
  it("reads wall time in the given zone, not as UTC", () => {
    // 2:30 PM in Los Angeles during PDT is 21:30 UTC.
    const d = zonedWallTimeToUtc("2026-09-15T14:30", "America/Los_Angeles");
    expect(d.toISOString()).toBe("2026-09-15T21:30:00.000Z");
  });

  it("applies the right offset either side of a DST change", () => {
    // PST (UTC-8) in January, PDT (UTC-7) in July.
    expect(zonedWallTimeToUtc("2026-01-15T12:00", "America/Los_Angeles").toISOString())
      .toBe("2026-01-15T20:00:00.000Z");
    expect(zonedWallTimeToUtc("2026-07-15T12:00", "America/Los_Angeles").toISOString())
      .toBe("2026-07-15T19:00:00.000Z");
  });

  it("handles a zone east of UTC", () => {
    expect(zonedWallTimeToUtc("2026-09-15T09:00", "Europe/Berlin").toISOString())
      .toBe("2026-09-15T07:00:00.000Z");
  });
});

describe("formatFloating", () => {
  it("emits no zone designator", () => {
    expect(formatFloating("2026-09-15T14:30")).toBe("20260915T143000");
  });
});

describe("buildIcs", () => {
  const base = {
    title: "Teeth cleaning",
    start: "2026-09-15T14:30",
    end: "2026-09-15T15:15",
    timeZone: "America/Los_Angeles",
  };

  it("does not label a local wall time as UTC", () => {
    const ics = buildIcs(base, NOW);
    // The regression that matters: 143000Z would be the wrong instant.
    expect(ics).not.toContain("DTSTART:20260915T143000Z");
    expect(ics).toContain("DTSTART:20260915T213000Z");
    expect(ics).toContain("DTEND:20260915T221500Z");
  });

  it("includes the properties clients require", () => {
    const ics = buildIcs(base, NOW);
    expect(ics).toContain("PRODID:");
    expect(ics).toMatch(/\r\nUID:/);
    expect(ics).toContain("DTSTAMP:20260101T000000Z");
  });

  it("uses CRLF and ends with one", () => {
    const ics = buildIcs(base, NOW);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it("gives the same event the same UID and different events different ones", () => {
    const a = buildIcs(base, NOW).match(/UID:(.*)/)![1];
    const b = buildIcs({ ...base }, NOW).match(/UID:(.*)/)![1];
    const c = buildIcs({ ...base, title: "Filling" }, NOW).match(/UID:(.*)/)![1];
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("escapes a real address rather than emitting bare separators", () => {
    const ics = buildIcs(
      { ...base, location: "123 Main St, Suite 4; Seattle, WA" },
      NOW,
    );
    expect(ics).toContain(
      "LOCATION:123 Main St\\, Suite 4\\; Seattle\\, WA",
    );
    // A bare separator would end the property value early.
    expect(ics).not.toMatch(/LOCATION:[^\r]*[^\\]};/);
  });

  it("omits the alarm unless one was asked for", () => {
    expect(buildIcs(base, NOW)).not.toContain("BEGIN:VALARM");
    expect(buildIcs({ ...base, reminderMinutes: 30 }, NOW)).toContain("TRIGGER:-PT30M");
  });

  it("emits a floating time with no Z when asked", () => {
    const ics = buildIcs({ ...base, timeZone: "floating" }, NOW);
    expect(ics).toContain("DTSTART:20260915T143000");
    expect(ics).not.toContain("DTSTART:20260915T143000Z");
  });
});

describe("isWallTime", () => {
  // The QR maker rebuilds its payload on every keystroke, so it sees the
  // date field in every partial state a person types through. Building an
  // event from one of those throws, and a throw inside a render blanks the
  // page — hence the guard, and hence this test.
  it("accepts a complete datetime-local value", () => {
    expect(isWallTime("2026-09-15T14:30")).toBe(true);
    expect(isWallTime("2026-09-15T14:30:45")).toBe(true);
  });

  it("rejects empty and half-typed values", () => {
    for (const partial of ["", "2026", "2026-09", "2026-09-15", "2026-09-15T", "2026-09-15T14"]) {
      expect(isWallTime(partial)).toBe(false);
    }
  });

  it("guards the call that would otherwise throw", () => {
    expect(() => buildIcs({ title: "Coffee", start: "", timeZone: "UTC" })).toThrow();
    expect(isWallTime("")).toBe(false);
  });
});
