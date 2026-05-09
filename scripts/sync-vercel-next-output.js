#!/usr/bin/env node
/**
 * When Vercel builds from the repo root, `next build` runs in `web/` and writes
 * `web/.next`. The Next.js preset expects `.next` at the project root.
 *
 * Naively copying `web/.next` → `.next` breaks file tracing: each `*.nft.json`
 * lists paths like `../../node_modules/...` relative to `web/.next/...`. After
 * the copy those files live under `.next/...` (one level shallower), so the same
 * `../../` resolves past the repo into `/vercel/node_modules` → ENOENT on
 * `@swc/helpers/...`. We fix traces after copy by stripping one leading `../`
 * from every entry in each `.nft.json` "files" array.
 *
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

/** One less `..` because `.next` moved from `web/.next` to repo root. */
function stripOneParentDir(relPath) {
  if (typeof relPath !== "string" || !relPath.startsWith("../")) {
    return relPath;
  }
  return relPath.slice(3);
}

function rewriteNftJson(filePath) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return;
  }
  if (!data || !Array.isArray(data.files)) {
    return;
  }
  let changed = false;
  data.files = data.files.map((f) => {
    const next = stripOneParentDir(f);
    if (next !== f) {
      changed = true;
    }
    return next;
  });
  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(data));
  }
}

function walkRewriteNft(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkRewriteNft(full);
    } else if (e.name.endsWith(".nft.json")) {
      rewriteNftJson(full);
    }
  }
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
walkRewriteNft(dest);
