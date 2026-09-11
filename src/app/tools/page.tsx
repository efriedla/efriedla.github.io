import type { Metadata } from "next";
import { ToolShowcase } from "@/components/ToolShowcase";
import { tools } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Tools",
  description:
    "Small, dependency-free utilities for things that look simple and are not — starting with calendar events. Copy the file.",
};

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10">
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-accent">
          Code you can take
        </p>
        <h1 className="mt-2 mb-0 text-3xl font-semibold tracking-tight sm:text-4xl">
          Tools
        </h1>
        <p className="mt-4 mb-0 text-[1.0625rem] leading-relaxed text-ink-soft">
          Utilities for formats that look simple and are not. Each one is a
          single file with no runtime dependency, and each exists because the
          obvious implementation is subtly wrong in a way that still appears to
          work.
        </p>
        <p className="mt-4 mb-0 text-[0.9375rem] leading-relaxed text-ink-soft">
          Change the fields and watch the output. Then take the file.
        </p>
      </header>

      <div className="grid gap-10">
        {tools.map((meta) => (
          <ToolShowcase key={meta.slug} meta={meta} />
        ))}
      </div>
    </div>
  );
}
