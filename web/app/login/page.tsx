"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function LoginPage() {
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { refresh } = useAuth();

  async function continueAsDemo() {
    setErr("");
    setPending(true);
    const { ok, data } = await apiFetch<{ errors?: string[] }>("/api/v1/auth/demo", {
      method: "POST",
      body: "{}",
    });
    setPending(false);
    if (!ok) {
      const msg =
        data && typeof data === "object" && "errors" in data && Array.isArray((data as { errors: string[] }).errors)
          ? (data as { errors: string[] }).errors.join(", ")
          : "Could not start demo session";
      setErr(msg);
      return;
    }
    await refresh();
    router.push("/console");
  }

  return (
    <div className="bg-background relative flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle variant="outline" />
      </div>
      <div className="w-full max-w-sm">
        <Link href="/" className="text-on-surface mb-8 block text-center text-base font-semibold tracking-tight">
          NetIQ
        </Link>
        <h1 className="text-on-surface text-center text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-on-surface-variant mt-1 text-center text-sm">
          Use the shared demo workspace — no email or password.
        </p>
        <div className="mt-10 flex flex-col gap-4">
          {err && <p className="text-error text-center text-sm">{err}</p>}
          <button
            type="button"
            onClick={() => void continueAsDemo()}
            disabled={pending}
            className="bg-primary text-on-primary hover:opacity-90 inline-flex items-center justify-center gap-1.5 rounded-md py-3 text-sm font-medium transition-opacity disabled:opacity-50"
          >
            {pending ? "Opening…" : "Continue as demo user"}
            {!pending ? (
              <span className="material-symbols-outlined text-[16px] leading-none">arrow_forward</span>
            ) : null}
          </button>
          <p className="text-on-surface-variant text-center text-xs leading-relaxed">
            Everyone shares one demo account for exploring keys, policies, and the simulator. Data resets if the API
            database is cleared.
          </p>
        </div>
        <p className="text-on-surface-variant mt-8 text-center text-sm">
          <Link href="/" className="text-on-surface hover:underline">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
