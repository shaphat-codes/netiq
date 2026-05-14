"use client";

import Link from "next/link";

import { useConsoleLayout } from "@/contexts/console-layout-context";
import { useAuth } from "@/contexts/auth-context";
import { ThemeToggle } from "@/components/ThemeToggle";

export function TopBar({ title }: { title: string }) {
  const { logout, me } = useAuth();
  const { openMobileNav } = useConsoleLayout();

  return (
    <header className="bg-surface border-outline-variant sticky top-0 z-[45] flex h-14 w-full shrink-0 items-center justify-between gap-2 border-b px-4 sm:px-6 md:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          type="button"
          className="text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface -ml-1 inline-flex shrink-0 rounded-md p-2 md:hidden"
          aria-label="Open navigation menu"
          onClick={openMobileNav}
        >
          <span className="material-symbols-outlined text-[22px] leading-none">menu</span>
        </button>
        {title ? (
          <h2 className="text-on-surface min-w-0 truncate text-sm font-medium tracking-tight">{title}</h2>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {me ? (
          <span className="text-on-surface-variant hidden max-w-[11rem] truncate text-xs sm:inline md:max-w-xs">
            {me.email}
          </span>
        ) : null}
        <Link
          href="/demo"
          className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-[16px] leading-none">apps</span>
          <span className="hidden sm:inline">Demos</span>
        </Link>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => logout()}
          className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-[16px] leading-none">logout</span>
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
