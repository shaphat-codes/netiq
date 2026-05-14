import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vercel / `vercel dev`: never point `outputFileTracingRoot` outside `web/`
 * (breaks serverless NFT and you get "Could not find a production build in
 * /var/task/.next"). Env can differ between CI steps; treat several signals.
 */
const runningOnVercel = Boolean(
  process.env.VERCEL_ENV ||
    process.env.VERCEL_URL ||
    process.env.VERCEL === "1" ||
    process.env.VERCEL === "true",
);

/**
 * `standalone` is **only** for Docker (`Dockerfile` copies
 * `web/.next/standalone`). Default output must stay non-standalone so Vercel
 * (and `next start` locally) keep `.next` where the platform expects it.
 * If `next build` ever runs without `VERCEL_*` set, inferring "Vercel" fails
 * and standalone used to break `/api/*` with the missing `.next` error above.
 */
const useStandaloneOutput =
  process.env.NETIQ_NEXT_STANDALONE === "1" ||
  process.env.NETIQ_NEXT_STANDALONE === "true";

const nextConfig: NextConfig = {
  ...(!runningOnVercel ? { outputFileTracingRoot: path.join(configDir, "..") } : {}),
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
