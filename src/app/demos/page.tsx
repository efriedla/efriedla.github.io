import type { Metadata } from "next";
import { LoaderShowcase } from "@/components/LoaderShowcase";
import { loaders } from "@/lib/loaders";

export const metadata: Metadata = {
  title: "Loading-screen games",
  description:
    "Two playable loading states for React — a canvas arcade game and an SVG sorting puzzle. Single file, no dependencies, copy the source.",
};

export default function DemosPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10">
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-accent">
          Component gallery
        </p>
        <h1 className="mt-2 mb-0 text-3xl font-semibold tracking-tight sm:text-4xl">
          Loading-screen games
        </h1>
        <p className="mt-4 mb-0 text-[1.0625rem] leading-relaxed text-ink-soft">
          A long wait is a design problem, not just a spinner. These two cover a
          request that is genuinely in flight — never an absent one, which is a
          settled fact and deserves a plain sentence instead. Both are a single
          file with no dependency beyond React, both honour{" "}
          <code className="font-mono text-[0.9em]">prefers-reduced-motion</code>,
          and both are playable from the keyboard.
        </p>
        <p className="mt-4 mb-0 text-[0.9375rem] leading-relaxed text-ink-soft">
          Take them. Open the Code tab, copy the file, drop it in. They were
          built for{" "}
          <a
            href="https://github.com/efriedla/Pill-Price"
            className="text-accent underline underline-offset-2"
          >
            Pill&nbsp;Price
          </a>
          , where GitHub strips interactive markup out of a README — which is
          why this page exists.
        </p>
      </header>

      <div className="grid gap-10">
        {loaders.map((meta) => (
          <LoaderShowcase key={meta.slug} meta={meta} />
        ))}
      </div>

      <section className="mt-14 rounded-xl border border-line bg-bg-raised p-5 sm:p-6">
        <h2 className="m-0 text-base font-semibold">Using one</h2>
        <p className="mt-3 mb-0 text-[0.9375rem] leading-relaxed text-ink-soft">
          Both take the same props. Render one while a real request is pending
          and let it finish on its own terms — when the data lands, the loader
          switches to its ready state and waits for the player rather than
          yanking the screen away mid-shot.
        </p>
        <pre className="mt-4 mb-0 overflow-x-auto rounded-lg bg-bg-sunken p-4 font-mono text-xs leading-relaxed">
          <code>{`const { data, isLoading } = usePrices(query);

if (isLoading || !seen) {
  return (
    <PillShotLoader
      isLoading={isLoading}
      message="Finding the lowest prices"
      readyMessage="Prices found"
      continueLabel="See prices"
      onContinue={() => setSeen(true)}
      onSkip={() => setSeen(true)}
    />
  );
}`}</code>
        </pre>
        <dl className="mt-5 mb-0 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          {[
            ["isLoading", "Flip to false when the request settles. The game stays up until the player continues."],
            ["onContinue", "The player chose to move on. Show the result."],
            ["onSkip", "The player never wanted the game. Respect it immediately."],
            ["accentColor", "Defaults to #E8892F. Everything else is themed internally."],
          ].map(([prop, desc]) => (
            <div key={prop} className="contents">
              <dt className="font-mono text-xs text-ink">{prop}</dt>
              <dd className="m-0 text-ink-soft">{desc}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
