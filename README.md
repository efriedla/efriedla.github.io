# efriedla.github.io

Personal site for Elizabeth Friedland. Next.js, static-exported, deployed to
GitHub Pages on every push to `main`.

Live: **https://efriedla.github.io**

## Why it exists

GitHub sanitises HTML in markdown, so an interactive component cannot be shown
in a README. This site is where those components actually run, and the READMEs
link to it. `/demos` is the first of those pages.

## Local

```bash
nvm use            # Node 24, per .nvmrc
npm ci
npm run dev        # http://localhost:3000
```

## Checks

All three run in CI before a deploy ([`.github/workflows/pages.yml`](.github/workflows/pages.yml)).

```bash
npm run typecheck  # tsc --noEmit, strict
npm run lint       # eslint
npm run build      # next build → out/
```

## The loaders

`src/loaders/*.jsx` are the real components — plain dependency-free JSX so they
can be copied into any React project. `scripts/copy-loaders.mjs` copies them to
`public/loader-source/` at build time, and the gallery's Code tab fetches from
there. The code a visitor copies is therefore the same file the demo above it
is running; it cannot drift.

`src/loaders/*.d.ts` type them for this project without making a consumer take
on a type dependency.

Adding one: drop the `.jsx` in `src/loaders/`, add a `.d.ts` beside it, add an
entry to `src/lib/loaders.ts`, and register it in
`src/components/LoaderShowcase.tsx`.

## The résumé

Generated from `src/lib/resume.ts` — the same data the About page renders — so
the download and the page cannot disagree. The path is set in `src/lib/site.ts`.

It is **unlisted**: no page links to it and `robots.txt` excludes `/r/`, so it
does not surface in search or to a casual visitor. GitHub Pages has no
authentication, so this is an unguessable URL rather than a private one —
anyone holding the link can open it. To withdraw it, change the slug in
`site.ts`, delete the old file from `public/r/`, and rerun the command below.

```bash
npm run resume
```

## Layout

```
src/app/          routes (static export, trailingSlash)
src/components/   LoaderShowcase, CodePanel
src/loaders/      the loading-screen games, verbatim + .d.ts
src/lib/          site config, loader registry, résumé data
scripts/          build-time helpers
```

## Notes

- `trailingSlash: true` — a static export otherwise emits `demos.html` beside a
  `demos/` payload directory, and GitHub Pages resolves the bare `/demos`
  against the directory. Trailing slashes make every route emit its own
  `index.html`, so there is no ambiguity.
- `out/.nojekyll` is written by `postbuild`; without it Pages drops `_next/`.
- Colour values live only in `src/app/globals.css`.
