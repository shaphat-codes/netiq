#!/usr/bin/env node
/**
 * When Vercel builds from the repo root, `next build` runs in `web/` and writes
 * `web/.next`. The Next.js preset expects `.next` at the project root.
 * Copy only on Vercel (VERCEL=1).
 */
const fs = require("fs");
const path = require("path");

if (process.env.VERCEL !== "1") {
  process.exit(0);
}

const root = path.join(__dirname, "..");
const src = path.join(root, "web", ".next");
const dest = path.join(root, ".next");

if (!fs.existsSync(src)) {
  console.error("sync-vercel-next-output: expected build output at", src);
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
