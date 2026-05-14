"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useConsoleLayout } from "@/contexts/console-layout-context";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const mainLinks: NavItem[] = [
  { href: "/console", label: "Overview", icon: "dashboard" },
  { href: "/console/keys", label: "API keys", icon: "vpn_key" },
  { href: "/console/events", label: "Activity", icon: "history" },
  { href: "/console/policies", label: "Policies", icon: "policy" },
  { href: "/console/simulator", label: "Simulator", icon: "terminal" },
  { href: "/console/demo/a2a", label: "A2A demo", icon: "dns" },
];

function NavRow({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`group flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors ${
        active
          ? "bg-surface-container text-on-surface font-medium"
          : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
      }`}
    >
      <span className="material-symbols-outlined text-[18px] leading-none">{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const path = usePathname();
  const { mobileNavOpen, closeMobileNav } = useConsoleLayout();

  useEffect(() => {
    closeMobileNav();
  }, [path, closeMobileNav]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) closeMobileNav();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [closeMobileNav]);

  return (
    <>
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeMobileNav}
        />
      ) : null}

      <aside
        className={`bg-surface border-outline-variant fixed left-0 top-0 z-50 flex h-full w-[min(100vw,15rem)] max-w-[85vw] flex-col border-r py-5 transition-transform duration-200 ease-out md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0 shadow-xl" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="mb-6 flex items-center justify-between gap-2 px-4 md:px-5">
          <Link href="/console" className="flex min-w-0 items-center gap-2" onClick={closeMobileNav}>
            <span className="text-on-surface truncate text-base font-semibold tracking-tight">NetIQ</span>
            <span className="text-on-surface-variant shrink-0 text-xs">/ console</span>
          </Link>
          <button
            type="button"
            className="text-on-surface-variant hover:text-on-surface -mr-1 shrink-0 rounded-md p-1 md:hidden"
            aria-label="Close menu"
            onClick={closeMobileNav}
          >
            <span className="material-symbols-outlined text-[22px] leading-none">close</span>
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 md:px-3">
          {mainLinks.map((l) => {
            const active = path === l.href || (l.href !== "/console" && path?.startsWith(l.href));
            return (
              <NavRow key={l.href} item={l} active={!!active} onNavigate={closeMobileNav} />
            );
          })}
        </nav>

        <div className="mt-2 space-y-0.5 px-2 md:px-3">
          <Link
            href="/console/docs"
            onClick={closeMobileNav}
            className="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface group flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">menu_book</span>
            <span>Documentation</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
