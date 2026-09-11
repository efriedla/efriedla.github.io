// The gallery serves each loader's real source file, so the code a visitor
// copies is the same file the demo above it is running. Copying at build time
// keeps that a single source of truth instead of a pasted duplicate.
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const from = "src/loaders";
const to = "public/loader-source";

await mkdir(to, { recursive: true });
const files = (await readdir(from)).filter((f) => f.endsWith(".jsx"));
await Promise.all(files.map((f) => copyFile(join(from, f), join(to, f))));
console.log(`copied ${files.length} loader source files to ${to}`);
