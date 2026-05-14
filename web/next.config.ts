import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const truthy = (v: string | undefined) => v === "1" || v === "true";

/**
 * Monorepo / Docker only: trace from repo parent (e.g. `/app` in Dockerfile).
 * **Never** set on Vercel when Root Directory = `web`.
 */
const useMonorepoTraceRoot = truthy(process.env.NETIQ_MONOREPO_TRACE_ROOT);

/**
 * Docker image only — requires both flags so a stray `NETIQ_NEXT_STANDALONE`
 * on Vercel cannot re-enable standalone (Vercel needs the default `.next`
 * layout under `/var/task/.next`).
 */
const useStandaloneOutput =
  truthy(process.env.NETIQ_NEXT_STANDALONE) &&
  truthy(process.env.NETIQ_DOCKER_IMAGE);

const nextConfig: NextConfig = {
  /**
   * Default: lock tracing to this app (`web/`). Next can otherwise infer a
   * workspace root above `web/`; NFT then references `../node_modules/...`,
   * and Vercel Root Directory = `web` **does not ship parent paths** in the
   * serverless bundle → launcher finds no `/var/task/.next`.
   */
  outputFileTracingRoot: useMonorepoTraceRoot
    ? path.join(configDir, "..")
    : configDir,
  /**
   * Belt-and-suspenders: ensure server traces always pull core `.next` files
   * (see outputFileTracingIncludes in Next docs).
   */
  outputFileTracingIncludes: {
    "/*": [
      ".next/BUILD_ID",
      ".next/required-server-files.json",
      ".next/routes-manifest.json",
      ".next/prerender-manifest.json",
      ".next/package.json",
      ".next/server/**/*",
    ],
  },
  ...(useStandaloneOutput ? { output: "standalone" as const } : {}),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/aida-public/**",
      },
    ],
  },
};

export default nextConfig;
