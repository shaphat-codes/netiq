#!/usr/bin/env node
/**
 * When Vercel builds from the repo root, `next build` runs in `web/` and writes
 * `web/.next`. The Next.js preset expects `.next` at the project root.
 *
 * Copying `web/.next` → `.next` shifts every NFT file one segment shallower in
 * the repo, but paths *inside* the `.next` tree (e.g. `../package.json` from
 * `server/pages`) must stay valid — only targets that lived under `web/.next`
 * move to `repo/.next`, while `node_modules` at the repo root stay put.
 * We rewrite each `*.nft.json` "files" entry by resolving against the old
 * directory (`web/.next/...`), mapping the absolute target into post-copy
 * layout, then `path.relative` from the NFT's new directory.
 *
 * Run only on Vercel builds (`VERCEL_ENV` is set on builds and `vercel dev`;
 * `VERCEL=1|true` is a fallback).
 */
const fs = require("fs");
const path = require("path");

const shouldSyncWebNextToRoot =
  Boolean(process.env.VERCEL_ENV) ||
  process.env.VERCEL === "1" ||
  process.env.VERCEL === "true";

if (!shouldSyncWebNextToRoot) {
  process.exit(0);
}

const root = path.join(__dirname, "..");
const src = path.join(root, "web", ".next");
const dest = path.join(root, ".next");

if (!fs.existsSync(src)) {
  console.error("sync-vercel-next-output: expected build output at", src);
  process.exit(1);
}

/** dirname this NFT would have had under `web/.next` before copy */
function oldNftDir(absNftPath, repoRoot) {
  const dir = path.dirname(absNftPath);
  const relInsideDotNext = path.relative(path.join(repoRoot, ".next"), dir);
  if (relInsideDotNext.startsWith("..")) {
    throw new Error(
      `sync-vercel-next-output: NFT outside .next: ${absNftPath}`,
    );
  }
  return path.join(repoRoot, "web", ".next", relInsideDotNext);
}

/** absolute path of traced file after `web/.next` → `.next` relocation */
function mapTargetAbsolute(oldAbs, repoRoot) {
  const webDotNext = path.join(repoRoot, "web", ".next");
  const rel = path.relative(webDotNext, oldAbs);
  if (rel === "") {
    return path.join(repoRoot, ".next");
  }
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    return path.join(repoRoot, ".next", rel);
  }
  return oldAbs;
}

function rewriteNftJson(absNftPath, repoRoot) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(absNftPath, "utf8"));
  } catch {
    return;
  }
  if (!data || !Array.isArray(data.files)) {
    return;
  }
  const oldDir = oldNftDir(absNftPath, repoRoot);
  const newDir = path.dirname(absNftPath);
  let changed = false;
  data.files = data.files.map((f) => {
    const oldAbs = path.resolve(oldDir, f);
    const newAbs = mapTargetAbsolute(oldAbs, repoRoot);
    let rel = path.relative(newDir, newAbs);
    rel = rel.split(path.sep).join("/");
    if (rel !== f) {
      changed = true;
    }
    return rel;
  });
  if (changed) {
    fs.writeFileSync(absNftPath, JSON.stringify(data));
  }
}

function walkRewriteNft(dir, repoRoot) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkRewriteNft(full, repoRoot);
    } else if (e.name.endsWith(".nft.json")) {
      rewriteNftJson(full, repoRoot);
    }
  }
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
walkRewriteNft(dest, root);
