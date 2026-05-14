#!/usr/bin/env node
/**
 * Legacy helper: copies `web/.next` → repo root `.next` and rewrites NFT paths.
 *
 * **Do not use** with the current layout (`npm ci --prefix web` / Root Directory =
 * `web`): `.next` must stay next to `web/node_modules`. Copying only `.next` to
 * the repo root while `node_modules` remains under `web/` breaks Vercel with
 * ENOENT for `build-manifest.json` and MODULE_NOT_FOUND for `react/jsx-runtime`
 * (launcher resolves under `/var/task/web/` but looks for `.next` under
 * `/var/task/.next`).
 *
 * Kept only for unusual self-managed pipelines that hoist `node_modules` at the
 * repo root to match a root-level `.next`.
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
