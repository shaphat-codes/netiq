"use client";

import Link from "next/link";

import { ThemeToggle } from "@/components/ThemeToggle";

export function DemoChrome({
  sectorId,
  brand,
  tagline,
  intentLabel,
  children,
}: {
  sectorId: string;
  brand: string;
  tagline: string;
  intentLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <header className="border-outline-variant bg-surface sticky top-0 z-40 flex h-14 items-center justify-between border-b px-6">
        <Link
          href="/demo"
          className="text-on-surface-variant hover:text-on-surface flex items-center gap-1.5 text-xs font-medium"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Demo hub
        </Link>
        <div className="text-on-surface-variant hidden text-xs sm:block">
          {brand} · {intentLabel}
        </div>
        <ThemeToggle />
      </header>

      <main
        data-demo-sector={sectorId}
        className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-20 pt-10 lg:flex-row lg:items-start lg:gap-12 lg:pt-16"
      >
        <aside className="mb-10 max-w-sm flex-1 lg:mb-0 lg:pt-12">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--demo-accent)" }}
          >
            {sectorId} · NetIQ-powered
          </p>
          <h1 className="text-on-surface mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            {brand}
          </h1>
          <p className="text-on-surface-variant mt-3 text-sm leading-relaxed">
            {tagline}
          </p>
          <ul className="text-on-surface-variant mt-5 space-y-2 text-xs leading-relaxed">
            <li className="flex items-start gap-2">
              <span
                className="material-symbols-outlined mt-0.5 text-[16px]"
                style={{ color: "var(--demo-accent)" }}
              >
                check_circle
              </span>
              <span>
                Sign-in is gated by a real NetIQ <code>onboarding</code> decision —
                SIM swap, device, reachability checks against the carrier.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span
                className="material-symbols-outlined mt-0.5 text-[16px]"
                style={{ color: "var(--demo-accent)" }}
              >
                check_circle
              </span>
              <span>
                Each in-app action calls the same{" "}
                <code className="font-mono">/decision/run</code> with a
                sector-specific intent.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span
                className="material-symbols-outlined mt-0.5 text-[16px]"
                style={{ color: "var(--demo-accent)" }}
              >
                check_circle
              </span>
              <span>
                Memory persists across all four apps — sign in here, switch demos,
                NetIQ remembers.
              </span>
            </li>
          </ul>
        </aside>

        <div className="flex flex-1 justify-center">{children}</div>
      </main>
    </div>
  );
}
