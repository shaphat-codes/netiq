import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /** Monorepo: trace files from repo root when `web/` is not the git root on disk */
  outputFileTracingRoot: path.join(configDir, ".."),
  /**
   * `standalone` is for Docker (`Dockerfile` copies `web/.next/standalone`).
   * On Vercel (`VERCEL=1`), use the default output: standalone duplicates `.next`
   * under `.next/standalone/...` and breaks the platform bundler (ENOENT under
   * `.next/server/...`).
   */
  ...(process.env.VERCEL === "1" ? {} : { output: "standalone" as const }),
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
