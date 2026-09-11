import type { Metadata } from "next";
import { QrScanTest } from "@/components/QrScanTest";

export const metadata: Metadata = {
  title: "QR scan test",
  description: "Internal: which calendar payload a real phone camera can act on.",
  robots: { index: false, follow: false },
};

export default function QrTestPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="m-0 text-2xl font-semibold tracking-tight">QR scan test</h1>
      <p className="mt-3 mb-8 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-soft">
        Scan each code with the phone’s built-in camera first, then with a
        dedicated scanner app. The question is not whether the payload is
        correct — it is whether the phone offers to do anything with it.
      </p>
      <QrScanTest />
    </div>
  );
}
