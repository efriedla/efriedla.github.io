import Link from "next/link";
import { site } from "@/lib/site";
import { experience, stack } from "@/lib/resume";

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="about">
        <h1
          id="about"
          className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          {site.name}
        </h1>
        <p className="mt-1 mb-0 text-[1.0625rem] text-ink-soft">{site.role}</p>

        <div className="mt-6 grid gap-4 text-[1.0625rem] leading-relaxed">
          <p className="m-0">
            I have spent nine years building React and TypeScript applications
            across healthcare, public safety, financial services and consumer
            products. The healthcare work stayed with me: when an interface is
            unclear or unreliable there, the cost is not a bounced session — it
            is someone not getting information they needed.
          </p>
          <p className="m-0">
            That shows up in how I build. I care about what a screen does when
            the data is incomplete, when the network is gone, when the user
            cannot see colour, and when the page is the slowest one in the
            product. Those states are the product, not an edge case to paper
            over — a stub that invents a plausible value reads as a working
            feature, and that is worse than an empty one.
          </p>
          <p className="m-0">
            I also work across the API boundary rather than up against it. I
            have designed GraphQL schemas and then built the services behind
            them, which is the fastest way I know to stop discovering
            integration problems at handoff.
          </p>
        </div>

        <ul className="mt-7 flex list-none flex-wrap gap-2 p-0">
          {[
            { href: site.github, label: "GitHub" },
            { href: site.linkedin, label: "LinkedIn" },
          ].map((l) => (
            <li key={l.label}>
              <a
                href={l.href}
                className="inline-block rounded-full border border-line-strong px-4 py-1.5 text-sm no-underline hover:bg-bg-raised"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        {/* The résumé is deliberately unlisted rather than linked, so this line
            is how a visitor learns it exists. */}
        <p className="mt-4 mb-0 text-sm text-ink-faint">
          Résumé on request —{" "}
          <a
            href={site.linkedin}
            className="text-ink-soft underline underline-offset-2"
          >
            reach me on LinkedIn
          </a>
          .
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="work" className="mt-16">
        <h2 id="work" className="m-0 text-xs font-semibold uppercase tracking-wide text-accent">
          Things you can open
        </h2>

        <div className="mt-4 grid gap-4">
          <article className="rounded-xl border border-line bg-bg-raised p-5">
            <h3 className="m-0 text-lg font-semibold tracking-tight">
              <Link href="/demos" className="no-underline">
                Loading-screen games
              </Link>
            </h3>
            <p className="mt-2 mb-0 text-[0.9375rem] leading-relaxed text-ink-soft">
              A canvas arcade game and an SVG sorting puzzle, built to cover a
              request that is genuinely in flight. Single file, React only,
              keyboard playable, reduced-motion aware. Play them and copy the
              source.
            </p>
            <p className="mt-3 mb-0">
              <Link href="/demos" className="text-sm text-accent no-underline">
                Play and copy →
              </Link>
            </p>
          </article>

          <article className="rounded-xl border border-line bg-bg-raised p-5">
            <h3 className="m-0 text-lg font-semibold tracking-tight">Pill Price</h3>
            <p className="mt-2 mb-0 text-[0.9375rem] leading-relaxed text-ink-soft">
              A drug-pricing reference on RxNorm, openFDA and NADAC — Next.js,
              strict TypeScript, and a GraphQL backend-for-frontend. Module
              boundaries are enforced by lint and asserted by a test that fails
              if the rule ever stops rejecting violations; generated types are
              checked for drift in CI; Storybook components are tested in a real
              browser. Architectural decisions are written down as ADRs before
              the code they authorise.
            </p>
            <p className="mt-3 mb-0 text-sm text-ink-faint">
              In progress — the data layer is being built in the open.
            </p>
            <p className="mt-3 mb-0">
              <a
                href="https://github.com/efriedla/Pill-Price"
                className="text-sm text-accent no-underline"
              >
                Source →
              </a>
            </p>
          </article>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="exp" className="mt-16">
        <h2 id="exp" className="m-0 text-xs font-semibold uppercase tracking-wide text-accent">
          Experience
        </h2>
        <ol className="mt-4 mb-0 grid list-none gap-8 p-0">
          {experience.map((job) => (
            <li key={`${job.org}-${job.dates}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="m-0 text-base font-semibold tracking-tight">
                  {job.role} · {job.org}
                </h3>
                <p className="m-0 font-mono text-xs text-ink-faint">{job.dates}</p>
              </div>
              <p className="mt-0.5 mb-0 text-sm text-ink-faint">{job.context}</p>
              <ul className="mt-2.5 mb-0 grid gap-1.5 ps-5 text-[0.9375rem] leading-relaxed text-ink-soft">
                {job.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="stack" className="mt-16">
        <h2 id="stack" className="m-0 text-xs font-semibold uppercase tracking-wide text-accent">
          Tools
        </h2>
        <dl className="mt-4 mb-0 grid gap-5">
          {stack.map((group) => (
            <div key={group.label}>
              <dt className="text-sm font-semibold">{group.label}</dt>
              <dd className="mt-1.5 mb-0 ms-0">
                <ul className="flex list-none flex-wrap gap-1.5 p-0">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="rounded-md bg-bg-sunken px-2 py-1 text-xs text-ink-soft"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
