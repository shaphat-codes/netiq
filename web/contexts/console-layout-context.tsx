"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ConsoleLayoutValue = {
  mobileNavOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;
};

const ConsoleLayoutContext = createContext<ConsoleLayoutValue | null>(null);

export function ConsoleLayoutProvider({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  const value = useMemo(
    () => ({ mobileNavOpen, openMobileNav, closeMobileNav }),
    [mobileNavOpen, openMobileNav, closeMobileNav],
  );

  return <ConsoleLayoutContext.Provider value={value}>{children}</ConsoleLayoutContext.Provider>;
}

export function useConsoleLayout(): ConsoleLayoutValue {
  const ctx = useContext(ConsoleLayoutContext);
  if (!ctx) {
    throw new Error("useConsoleLayout must be used within ConsoleLayoutProvider");
  }
  return ctx;
}
