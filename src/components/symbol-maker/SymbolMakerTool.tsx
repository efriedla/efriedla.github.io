"use client";

import dynamic from "next/dynamic";

// Konva draws on a real <canvas> and reads `window` as it loads, so the maker
// can't be prerendered: it loads in the browser, with a placeholder the same
// height as the editor so the page doesn't jump when it arrives.
const SymbolMaker = dynamic(() => import("./SymbolMaker").then((m) => m.SymbolMaker), {
  ssr: false,
  loading: () => (
    <div className="flex h-[clamp(560px,80vh,800px)] items-center justify-center bg-bg-sunken text-sm text-ink-faint">
      Loading the editor…
    </div>
  ),
});

export function SymbolMakerTool() {
  return <SymbolMaker storageKey="portfolio-symbol-maker-doc" />;
}
