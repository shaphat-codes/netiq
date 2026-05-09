"use client";

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

/**
 * Wraps next-themes with the project defaults:
 * - swaps a `dark`/`light` class on <html>
 * - persists choice to localStorage as `netiq-theme`
 * - falls back to system preference on first visit
 *
 * The `:root.dark` / `:root.light` rules in globals.css read these classes.
 */
export function ThemeProvider({ children, ...rest }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="netiq-theme"
      disableTransitionOnChange
      {...rest}
    >
      {children}
    </NextThemesProvider>
  );
}
