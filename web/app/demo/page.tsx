import Link from "next/link";

import { DemoForceAllowToggle } from "@/components/demo/DemoForceAllowToggle";
import { SectorPreview } from "@/components/demo/SectorPreview";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SECTOR_LIST } from "@/lib/demo/sectors";

export const metadata = {
  title: "NetIQ — Sector demos",
  description:
    "Four sector apps sharing one NetIQ trust layer: fintech, logistics, health, agritech.",
};

export default function DemoHubPage() {
  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <header className="border-outline-variant bg-surface sticky top-0 z-30 flex h-14 items-center justify-between border-b px-6">
        <Link
          href="/"
          className="text-on-surface-variant hover:text-on-surface flex items-center gap-1.5 text-xs font-medium"
        >
          <span className="material-symbols-outlined text-[16px]">home</span>
          NetIQ home
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <section className="mb-12 max-w-3xl">
          <p className="text-on-surface-variant text-xs font-medium uppercase tracking-[0.2em]">
            Sector demos
          </p>
          <h1 className="text-on-surface mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Four apps. Four products. One trust layer.
          </h1>
          <p className="text-on-surface-variant mt-4 text-sm leading-relaxed md:text-base">
            Each mockup below is a different startup with a different problem —
            but all of them sign users in with the same NetIQ session and gate
            critical actions through the same{" "}
            <code className="font-mono text-xs">/decision/run</code> API. What
            changes is the <em>intent</em> and the <em>context</em>; the
            integration is one POST.
          </p>
          <p className="text-on-surface-variant mt-3 text-sm leading-relaxed">
            Try this: sign in on any app, run a high-risk action, then open
            another — NetIQ remembers the phone&rsquo;s prior risk across sectors
            and the next decision changes.
          </p>
        </section>

        <DemoForceAllowToggle />

        <section className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {SECTOR_LIST.map((sector) => (
            <Link
              key={sector.id}
              href={`/demo/${sector.id}`}
              data-demo-sector={sector.id}
              className="group flex flex-col items-center text-center"
            >
              <div className="transition-transform group-hover:-translate-y-1">
                <SectorPreview sector={sector.id} />
              </div>
              <div className="mt-5">
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--demo-accent)" }}
                >
                  {sector.id}
                </p>
                <h2 className="text-on-surface mt-1 text-base font-semibold">
                  {sector.brand}
                </h2>
                <p className="text-on-surface-variant mt-1 text-xs leading-relaxed">
                  {sector.tagline}
                </p>
                <p
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium"
                  style={{ color: "var(--demo-accent)" }}
                >
                  Open mockup
                  <span className="material-symbols-outlined text-[14px] transition-transform group-hover:translate-x-0.5">
                    arrow_forward
                  </span>
                </p>
              </div>
            </Link>
          ))}
        </section>

        <section className="border-outline-variant text-on-surface-variant mt-16 border-t pt-6 text-xs">
          <p>
            All four apps share <code>web/components/demo/*</code> (PhoneFrame,
            session) and <code>web/lib/demo/*</code> (NetIQ client). Each sector
            page imports only its own bespoke <code>App</code> component, so any
            single mockup can be lifted into a standalone Next.js project later
            by copying that one file plus the shared kit and the{" "}
            <code>/api/netiq/*</code> Route Handlers.
          </p>
        </section>
      </main>
    </div>
  );
}
