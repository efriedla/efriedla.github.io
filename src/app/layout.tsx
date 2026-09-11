import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.role}`,
    template: `%s — ${site.name}`,
  },
  description:
    "React, TypeScript and Next.js work across healthcare, public safety and financial services — with the source for every piece.",
  openGraph: {
    title: `${site.name} — ${site.role}`,
    description:
      "React, TypeScript and Next.js work — with the source for every piece.",
    url: site.url,
    type: "website",
  },
};

const nav = [
  { href: "/", label: "About" },
  { href: "/demos", label: "Demos" },
  { href: "/tools", label: "Tools" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip">
          Skip to content
        </a>

        <header className="border-b border-line">
          <div className="mx-auto flex max-w-5xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 py-5 sm:px-6">
            <Link
              href="/"
              className="text-[0.9375rem] font-semibold tracking-tight no-underline"
            >
              {site.name}
            </Link>
            <nav aria-label="Primary">
              <ul className="flex list-none gap-5 p-0 text-sm">
                {nav.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-ink-soft no-underline hover:text-ink"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>

        <main id="main">{children}</main>

        <footer className="mt-24 border-t border-line">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-ink-faint sm:px-6">
            <p className="m-0">
              Built with Next.js and deployed to GitHub Pages.
            </p>
            <a href={site.github} className="text-ink-soft no-underline hover:text-ink">
              github.com/efriedla
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
