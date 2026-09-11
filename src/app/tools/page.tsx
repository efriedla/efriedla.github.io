import type { Metadata } from "next";
import { QrMaker } from "@/components/QrMaker";
import { ToolEntry } from "@/components/ToolEntry";

export const metadata: Metadata = {
  title: "Tools",
  description:
    "Small browser tools that do the whole job in the tab — starting with a QR code maker for links and calendar events.",
};

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10">
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-accent">
          Working tools
        </p>
        <h1 className="mt-2 mb-0 text-3xl font-semibold tracking-tight sm:text-4xl">
          Tools
        </h1>
        <p className="mt-4 mb-0 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-soft">
          Each one runs entirely in this tab — nothing is uploaded, nothing is
          stored, and none of them ask you to sign in. Open one to use it.
        </p>
      </header>

      <div className="grid gap-8">
        <ToolEntry
          title="QR code maker"
          tagline="Links and calendar events, styled and downloadable"
          defaultOpen
        >
          <QrMaker />
        </ToolEntry>
      </div>
    </div>
  );
}
