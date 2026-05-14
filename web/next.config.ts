import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const truthy = (v: string | undefined) => v === "1" || v === "true";

/**
 * Monorepo / Docker only. **Never** set on Vercel.
 *
 * Pointing `outputFileTracingRoot` at `..` when the deploy root is `web/`
 * breaks serverless NFT: the function bundle can omit `.next`, and `/api/*`
 * returns 500 ("Could not find a production build in /var/task/.next") even
 * though `VERCEL_*` is sometimes unset while `next.config` is evaluated.
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
  ...(useMonorepoTraceRoot
    ? { outputFileTracingRoot: path.join(configDir, "..") }
    : {}),
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
