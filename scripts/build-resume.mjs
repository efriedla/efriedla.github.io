/**
 * Renders the résumé PDF from the same data the site renders, so the download
 * and the page can never disagree. The output is committed, so this only needs
 * running when the résumé content changes:
 *
 *   npm run resume
 *
 * Deliberately excludes the cover letter — the .docx it came from contains a
 * letter addressed to one company, which has no business in a general download.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";
import { experience, stack, summary, education } from "../src/lib/resume.ts";
import { site } from "../src/lib/site.ts";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const html = `<!doctype html><meta charset="utf-8"><title>${esc(site.name)} — Résumé</title>
<style>
  @page { size: letter; margin: 0.55in 0.6in; }
  * { box-sizing: border-box; }
  body { margin:0; font: 10pt/1.45 "Helvetica Neue", Arial, sans-serif; color:#23303d; }
  h1 { margin:0; font-size:19pt; letter-spacing:-0.01em; }
  .role { margin:2pt 0 0; font-size:10.5pt; color:#5b6b7c; }
  .contact { margin:5pt 0 0; font-size:8.75pt; color:#5b6b7c; }
  .contact a { color:#5b6b7c; text-decoration:none; }
  h2 { margin:15pt 0 6pt; font-size:8pt; letter-spacing:0.09em; text-transform:uppercase;
       color:#b2452f; border-bottom:0.75pt solid #ddd8d1; padding-bottom:3pt; }
  .sum { margin:0; font-size:9.5pt; color:#3d4b59; }
  .job { margin:0 0 9pt; page-break-inside:avoid; }
  .jobhead { display:flex; justify-content:space-between; align-items:baseline; gap:12pt; }
  .jobtitle { margin:0; font-size:10.5pt; font-weight:700; }
  .dates { font-size:8.5pt; color:#8a97a5; white-space:nowrap; }
  .ctx { margin:1pt 0 3pt; font-size:8.75pt; color:#8a97a5; }
  ul { margin:0; padding-left:13pt; }
  li { margin:0 0 2pt; font-size:9.5pt; color:#3d4b59; }
  .grp { margin:0 0 3pt; font-size:9.5pt; }
  .grp b { font-weight:700; }
  .edu { margin:0 0 4pt; font-size:9.5pt; }
  .edu b { font-weight:700; }
  .edu span { color:#8a97a5; }
</style>
<h1>${esc(site.name)}</h1>
<p class="role">${esc(site.role)}</p>
<p class="contact">${esc(site.url.replace("https://", ""))} · ${esc(site.github.replace("https://", ""))} · ${esc(site.linkedin.replace("https://www.", "").replace(/\/$/, ""))}</p>

<h2>Summary</h2>
<p class="sum">${esc(summary)}</p>

<h2>Core technologies</h2>
${stack
  .map((g) => `<p class="grp"><b>${esc(g.label)}:</b> ${g.items.map(esc).join(", ")}</p>`)
  .join("")}

<h2>Experience</h2>
${experience
  .map(
    (j) => `<div class="job">
  <div class="jobhead"><p class="jobtitle">${esc(j.role)} · ${esc(j.org)}</p><span class="dates">${esc(j.dates)}</span></div>
  <p class="ctx">${esc(j.context)}</p>
  <ul>${j.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
</div>`,
  )
  .join("")}

<h2>Education &amp; professional development</h2>
${education
  .map(
    (e) =>
      `<p class="edu"><b>${esc(e.school)}</b> — ${esc(e.detail)}${e.note ? ` <span>(${esc(e.note)})</span>` : ""}</p>`,
  )
  .join("")}
`;

// Written to the unlisted path named in site.ts, so the slug lives in exactly
// one place.
const out = `public${site.resume}`;
await mkdir(dirname(out), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.pdf({ path: out, format: "Letter", printBackground: true });
await browser.close();
await writeFile("scripts/resume-preview.html", html);
console.log(`wrote ${out}`);
