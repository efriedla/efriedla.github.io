"use client";

import { useEffect, useRef, useState } from "react";

type State =
  | { tag: "loading" }
  | { tag: "ready"; source: string }
  | { tag: "failed" };

/**
 * Fetches a loader's real source file on first open. The file is the same one
 * the demo imports, so the code shown here can never drift from the code
 * running above it.
 */
export function CodePanel({
  raw,
  file,
  importLine,
  deps = "One file · React only · no dependencies",
}: {
  raw: string;
  file: string;
  importLine: string;
  /** Stated plainly: what a copier has to install. */
  deps?: string;
}) {
  const [state, setState] = useState<State>({ tag: "loading" });
  const [copied, setCopied] = useState<"no" | "yes" | "failed">("no");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    fetch(raw)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((source) => live && setState({ tag: "ready", source }))
      .catch(() => live && setState({ tag: "failed" }));
    return () => {
      live = false;
    };
  }, [raw]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    if (state.tag !== "ready") return;
    try {
      await navigator.clipboard.writeText(state.source);
      setCopied("yes");
    } catch {
      // Clipboard access is refused in some embedded and non-secure contexts.
      // Say so rather than showing a success state that didn't happen.
      setCopied("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied("no"), 2400);
  }

  const copyLabel =
    copied === "yes"
      ? "Copied"
      : copied === "failed"
        ? "Press ⌘C to copy"
        : `Copy ${file}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <code className="font-mono text-xs text-ink-soft">{file}</code>
        <span className="text-xs text-ink-faint">{deps}</span>
        <div className="ms-auto flex items-center gap-2">
          <a
            href={raw}
            className="rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-soft no-underline hover:border-line-strong hover:text-ink"
          >
            Raw
          </a>
          <button
            type="button"
            onClick={copy}
            disabled={state.tag !== "ready"}
            className="rounded-md border border-line-strong bg-bg-raised px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {copyLabel}
          </button>
        </div>
      </div>

      <p className="m-0 border-b border-line px-4 py-3 font-mono text-xs text-ink-soft">
        {importLine}
      </p>

      <div
        role="region"
        aria-label={`Source of ${file}`}
        tabIndex={0}
        className="max-h-[28rem] overflow-auto bg-bg-sunken"
      >
        {state.tag === "ready" ? (
          <pre className="m-0 p-4 font-mono text-xs leading-relaxed">
            <code>{state.source}</code>
          </pre>
        ) : (
          <p className="m-0 p-4 text-sm text-ink-soft">
            {state.tag === "failed" ? (
              <>
                The source could not be loaded.{" "}
                <a href={raw} className="text-accent">
                  Open {file} directly
                </a>
                .
              </>
            ) : (
              "Loading source…"
            )}
          </p>
        )}
      </div>
    </div>
  );
}
