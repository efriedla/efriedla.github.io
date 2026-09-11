"use client";

import { useId, useState } from "react";
import { CodePanel } from "./CodePanel";
import { IcsPlayground } from "./IcsPlayground";
import type { ToolMeta } from "@/lib/tools";

export function ToolShowcase({ meta }: { meta: ToolMeta }) {
  const [open, setOpen] = useState(false);
  const base = useId();

  return (
    <section
      aria-labelledby={`${base}-title`}
      className="overflow-hidden rounded-xl border border-line bg-bg-raised"
    >
      <div className="border-b border-line px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id={`${base}-title`} className="m-0 text-xl font-semibold tracking-tight">
            {meta.name}
          </h2>
          <p className="m-0 text-sm text-ink-faint">{meta.tagline}</p>
        </div>
        <p className="mt-2 mb-0 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-soft">
          {meta.about}
        </p>
        <p className="mt-3 mb-0 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
          <span>{meta.deps}</span>
          {meta.tests && <span>· {meta.tests}</span>}
        </p>
      </div>

      <IcsPlayground variant={meta.slug === "ics" ? "ics" : "links"} />

      <div className="border-b border-line px-4 py-4 sm:px-6">
        <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          What this gets right
        </h3>
        <ul className="mt-2 mb-0 grid gap-1.5 ps-5 text-sm leading-relaxed text-ink-soft">
          {meta.gotchas.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>

      {open ? (
        <CodePanel
          raw={meta.raw}
          file={meta.file}
          importLine={`// ${meta.file} — drop it in and import what you need`}
        />
      ) : (
        <div className="px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md border border-line-strong bg-bg-raised px-3 py-1.5 text-sm font-medium"
          >
            Show {meta.file}
          </button>
        </div>
      )}
    </section>
  );
}
