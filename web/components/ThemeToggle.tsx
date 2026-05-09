"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

type Variant = "ghost" | "outline";

export function ThemeToggle({
  variant = "ghost",
  className = "",
}: {
  variant?: Variant;
  className?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted ? resolvedTheme === "dark" : true;
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";
  const icon = isDark ? "light_mode" : "dark_mode";

  const base = "flex h-8 w-8 items-center justify-center rounded-md transition-colors";
  const tone =
    variant === "outline"
      ? "border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low border"
      : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface";

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`${base} ${tone} ${className}`}
    >
      <span
        className="material-symbols-outlined text-[18px] leading-none"
        suppressHydrationWarning
      >
        {icon}
      </span>
    </button>
  );
}
