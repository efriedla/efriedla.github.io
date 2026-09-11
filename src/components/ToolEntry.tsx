import { useId } from "react";

/**
 * One row in the tools list: a titled header that opens to reveal the working
 * tool. A native <details> does the collapsing, so the list needs no client
 * JavaScript, keyboard and screen-reader behaviour come for free, and browser
 * find-in-page can still reach a closed tool.
 *
 * The header is the site's own type and surface, so however differently a tool
 * paints itself once open, the closed list still reads as one list.
 */
export function ToolEntry({
  title,
  tagline,
  defaultOpen = false,
  children,
}: {
  title: string;
  tagline: string;
  /** Open on load. Worth it for the first entry, so the page isn't all lids. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();

  return (
    <details
      open={defaultOpen}
      className="tool-entry overflow-hidden rounded-xl border border-line bg-bg-raised"
    >
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
        <span className="tool-entry-marker text-ink-faint" aria-hidden="true">
          ▸
        </span>
        <h2 id={id} className="m-0 text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <span className="text-sm text-ink-faint">{tagline}</span>
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}
