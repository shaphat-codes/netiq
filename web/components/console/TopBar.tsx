"use client";

import Link from "next/link";

import { useAuth } from "@/contexts/auth-context";
import { ThemeToggle } from "@/components/ThemeToggle";

export function TopBar({ title }: { title: string }) {
  const { logout, me } = useAuth();

  return (
    <header className="bg-surface border-outline-variant sticky top-0 z-40 flex h-14 w-full shrink-0 items-center justify-between border-b px-8">
      <div className="flex min-w-0 flex-1 items-center">
        {title ? (
          <h2 className="text-on-surface text-sm font-medium tracking-tight">{title}</h2>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        {me ? (
          <span className="text-on-surface-variant hidden text-xs sm:inline">{me.email}</span>
        ) : null}
        <Link
          href="/demo"
          className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-[16px] leading-none">apps</span>
          Demos
        </Link>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => logout()}
          className="text-on-surface-variant hover:text-on-surface ml-1 inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-[16px] leading-none">logout</span>
          Sign out
        </button>
      </div>
    </header>
  );
}
