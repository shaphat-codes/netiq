"use client";

import { useEffect, useState } from "react";

const COOKIE_NAME = "netiq_demo_force_allow";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const parts = document.cookie.split(";").map((v) => v.trim());
  const prefix = `${name}=`;
  const found = parts.find((p) => p.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : "";
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

export function DemoForceAllowToggle() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const raw = readCookie(COOKIE_NAME).toLowerCase();
    setEnabled(raw === "1" || raw === "true" || raw === "on");
  }, []);

  function onToggle(next: boolean) {
    setEnabled(next);
    writeCookie(COOKIE_NAME, next ? "1" : "0");
  }

  return (
    <section className="border-outline-variant bg-surface-container mb-10 rounded-2xl border p-4 md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-on-surface text-sm font-semibold">
            Demo override: always allow onboarding
          </p>
          <p className="text-on-surface-variant mt-1 text-xs leading-relaxed">
            When enabled, sign-in/onboarding in all demo apps is allowed even if NetIQ returns BLOCK.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition ${
            enabled ? "bg-[var(--demo-accent,#2563eb)]" : "bg-outline-variant"
          }`}
        >
          <span
            className={`mt-0.5 inline-block h-6 w-6 rounded-full bg-white shadow transition ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </section>
  );
}
