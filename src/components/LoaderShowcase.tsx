"use client";

import { useId, useState } from "react";
import { PillShotLoader } from "@/loaders/PillShotLoader";
import { PillSortLoader } from "@/loaders/PillSortLoader";
import { CodePanel } from "./CodePanel";
import type { LoaderMeta } from "@/lib/loaders";
import type { LoaderProps } from "@/loaders/loader-props";

const components: Record<string, React.ComponentType<LoaderProps>> = {
  "pill-shot": PillShotLoader,
  "pill-sort": PillSortLoader,
};

type Tab = "demo" | "code";

export function LoaderShowcase({ meta }: { meta: LoaderMeta }) {
  const [tab, setTab] = useState<Tab>("demo");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState(0);
  const base = useId();

  const Loader = components[meta.slug];

  function start() {
    setPlaying(true);
    setLoading(true);
    setRun((r) => r + 1);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "demo", label: "Demo" },
    { id: "code", label: "Code" },
  ];

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
      </div>

      <div role="tablist" aria-label={`${meta.name} views`} className="flex gap-1 border-b border-line px-4 sm:px-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium ${
              tab === t.id
                ? "border-accent text-ink"
                : "border-transparent text-ink-faint hover:text-ink-soft"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${base}-panel-demo`}
        aria-labelledby={`${base}-tab-demo`}
        hidden={tab !== "demo"}
      >
        <div className="bg-bg-sunken p-4 sm:p-6">
          {playing ? (
            <Loader
              key={run}
              isLoading={loading}
              onContinue={() => setPlaying(false)}
              onSkip={() => setPlaying(false)}
            />
          ) : (
            <div className="grid aspect-[10/7] place-items-center rounded-xl border border-dashed border-line-strong text-center">
              <div className="px-6">
                <p className="m-0 text-[0.9375rem] text-ink-soft">
                  Nothing animates until you ask it to.
                </p>
                <button
                  type="button"
                  onClick={start}
                  className="mt-4 rounded-full border border-line-strong bg-bg-raised px-5 py-2 text-sm font-semibold"
                >
                  Play {meta.name}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3 sm:px-6">
          <p className="m-0 text-xs text-ink-faint">
            <span className="font-medium text-ink-soft">Keyboard:</span> {meta.keys}
          </p>
          {playing && (
            <div className="ms-auto flex gap-2">
              <button
                type="button"
                onClick={() => setLoading(false)}
                disabled={!loading}
                className="rounded-md border border-line px-2.5 py-1.5 text-xs disabled:opacity-50"
              >
                Finish loading
              </button>
              <button
                type="button"
                onClick={start}
                className="rounded-md border border-line px-2.5 py-1.5 text-xs"
              >
                Restart
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`${base}-panel-code`}
        aria-labelledby={`${base}-tab-code`}
        hidden={tab !== "code"}
      >
        {tab === "code" && (
          <CodePanel raw={meta.raw} file={meta.file} importLine={meta.importLine} />
        )}
      </div>

      <div className="border-t border-line px-4 py-4 sm:px-6">
        <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Worth knowing
        </h3>
        <ul className="mt-2 mb-0 grid gap-1.5 ps-5 text-sm leading-relaxed text-ink-soft">
          {meta.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
