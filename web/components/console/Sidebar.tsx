"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
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

  return (
    <aside className="bg-surface border-outline-variant fixed left-0 top-0 z-50 flex h-full w-60 flex-col border-r py-5">
      <div className="mb-6 px-5">
        <Link href="/console" className="flex items-center gap-2">
          <span className="text-on-surface text-base font-semibold tracking-tight">NetIQ</span>
          <span className="text-on-surface-variant text-xs">/ console</span>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        {mainLinks.map((l) => {
          const active = path === l.href || (l.href !== "/console" && path?.startsWith(l.href));
          return <NavRow key={l.href} item={l} active={!!active} />;
        })}
      </nav>

      <div className="mt-2 space-y-0.5 px-3">
        <Link
          href="/console/docs"
          className="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface group flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors"
        >
          <span className="material-symbols-outlined text-[18px] leading-none">menu_book</span>
          <span>Documentation</span>
        </Link>
      </div>
    </aside>
  );
}
