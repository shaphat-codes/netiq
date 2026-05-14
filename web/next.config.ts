import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /**
   * Monorepo: trace from repo root for Docker / local so `node_modules` at the
   * workspace root resolve. On Vercel, pointing outside `web/` breaks file
   * tracing for serverless Route Handlers — the function bundle can omit
   * `.next` and you get "Could not find a production build in /var/task/.next".
   */
  ...(process.env.VERCEL !== "1"
    ? { outputFileTracingRoot: path.join(configDir, "..") }
    : {}),
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
