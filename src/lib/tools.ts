export type ToolMeta = {
  slug: string;
  name: string;
  tagline: string;
  about: string;
  /** The mistakes this code exists to avoid. */
  gotchas: string[];
  file: string;
  raw: string;
  /** Copy-paste dependencies, stated plainly. */
  deps: string;
  /** Test count, so the claim of correctness is checkable. */
  tests?: string;
};

export const tools: ToolMeta[] = [
  {
    slug: "ics",
    name: "iCalendar event builder",
    tagline: "RFC 5545, done properly",
    about:
      "Turns a form into a valid VEVENT that Apple Calendar, Google Calendar and Outlook all accept. Most hand-rolled versions concatenate a few strings and appear to work, then import events at the wrong time or drop half an address.",
    gotchas: [
      "A datetime-local value is wall time with no zone. Appending Z labels it UTC, which moves a 2:30pm appointment to 7:30am in Los Angeles — and the event still imports cleanly, so nothing looks broken.",
      "Commas and semicolons are value separators. Unescaped, “123 Main St, Suite 4” truncates at the comma.",
      "UID, DTSTAMP and PRODID are required. Outlook is the strictest about their absence.",
      "Lines fold at 75 octets, not 75 characters — an emoji is four of them, and splitting one produces a replacement character.",
      "CRLF is required. Bare LF is tolerated by some parsers and not others.",
    ],
    file: "ics.ts",
    raw: "/tool-source/ics.ts",
    deps: "None. Plain TypeScript, no runtime dependency.",
    tests: "16 unit tests, run in CI on every deploy",
  },
  {
    slug: "calendar-links",
    name: "Calendar handoff links",
    tagline: "Prefilled Google and Outlook events",
    about:
      "Builds a URL that opens a prefilled event in Google Calendar or Outlook. Useful when a QR code has to work with a phone's built-in camera, which reliably opens links but may do nothing with a raw event payload.",
    gotchas: [
      "Google rejects a start with no end. This defaults to one hour rather than failing.",
      "Both want UTC, so the same wall-time-to-zone conversion applies here as in the event builder.",
      "Outlook wants ISO-8601 with separators; Google wants the compact form. The same instant, formatted two ways.",
    ],
    file: "calendar-links.ts",
    raw: "/tool-source/calendar-links.ts",
    deps: "Imports the zone helpers from ics.ts — take both files.",
  },
];
