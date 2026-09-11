/**
 * The galleries serve each item's real source file, so the code a visitor
 * copies is the same code the demo above it is running. Copying at build time
 * keeps that a single source of truth rather than a pasted duplicate.
 */
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const jobs = [
  { from: "src/loaders", to: "public/loader-source", ext: ".jsx" },
  { from: "src/lib", to: "public/tool-source", only: ["ics.ts", "calendar-links.ts"] },
];

for (const job of jobs) {
  await mkdir(job.to, { recursive: true });
  const all = await readdir(job.from);
  const files = job.only
    ? all.filter((f) => job.only.includes(f))
    : all.filter((f) => f.endsWith(job.ext));
  await Promise.all(files.map((f) => copyFile(join(job.from, f), join(job.to, f))));
  console.log(`copied ${files.length} files to ${job.to}`);
}
