"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { ConsoleLayoutProvider } from "@/contexts/console-layout-context";
import { Sidebar } from "./Sidebar";

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me) {
      router.replace("/login");
    }
  }, [loading, me, router]);

  if (loading) {
    return (
      <div className="bg-background text-on-surface-variant flex min-h-screen items-center justify-center">
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  if (!me) {
    return null;
  }

  return (
    <ConsoleLayoutProvider>
      <div className="bg-background text-on-background font-body min-h-screen">
        <Sidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col md:ml-60">{children}</div>
      </div>
    </ConsoleLayoutProvider>
  );
}
