"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { refresh } = useAuth();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setPending(true);
    const { ok, data } = await apiFetch<{ errors?: string[] }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setPending(false);
    if (!ok) {
      const msg =
        data && typeof data === "object" && "errors" in data && Array.isArray((data as { errors: string[] }).errors)
          ? (data as { errors: string[] }).errors.join(", ")
          : "Login failed";
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
        <p className="text-on-surface-variant mt-1 text-center text-sm">to your developer console</p>
        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
          <label className="block space-y-1">
            <span className="text-on-surface-variant text-xs">Email</span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface w-full rounded-md border px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-on-surface-variant text-xs">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface w-full rounded-md border px-3 py-2 text-sm outline-none"
            />
          </label>
          {err && <p className="text-error text-sm">{err}</p>}
          <button
            type="submit"
            disabled={pending}
            className="bg-primary text-on-primary hover:opacity-90 mt-2 inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-opacity disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Sign in"}
            {!pending ? (
              <span className="material-symbols-outlined text-[16px] leading-none">arrow_forward</span>
            ) : null}
          </button>
        </form>
        <p className="text-on-surface-variant mt-6 text-center text-sm">
          New here?{" "}
          <Link href="/register" className="text-on-surface hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
