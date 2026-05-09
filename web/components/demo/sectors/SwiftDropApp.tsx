"use client";

import { useState } from "react";

import { SECTORS } from "@/lib/demo/sectors";
import type { NetiqDecision } from "@/lib/demo/types";
import { bucketize, useSectorRunner } from "@/lib/demo/useSectorRunner";
import { useDemoSession } from "../DemoSessionProvider";
import { PhoneFrame } from "../PhoneFrame";

/**
 * SwiftDrop — courier dispatcher app. Bolt/Glovo-flavoured visuals.
 *
 * Onboarding signs the courier in, then Home shows two assigned parcels
 * which double as the two NetIQ-gated actions (verify pickup at hub,
 * rural-dispatch readiness check). Decisions render inline on each card.
 */

const SECTOR = SECTORS.logistics;
const APP_BG = "#0e0f12";
const ACCENT = "#ffd83a";
const ACCENT_INK = "#1c1300";

export function SwiftDropApp() {
  const { session } = useDemoSession();
  return (
    <PhoneFrame bg={APP_BG} statusBarTone="light">
      {!session ? <Onboarding /> : <Home />}
    </PhoneFrame>
  );
}

function Onboarding() {
  const { signIn } = useDemoSession();
  const [step, setStep] = useState<"splash" | "phone" | "verifying" | "blocked">(
    "splash"
  );
  const [phone, setPhone] = useState(SECTOR.defaultPhone);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setStep("verifying");
    setError(null);
    const res = await signIn({ phone, intent: SECTOR.signInIntent });
    if (res.ok) return;
    setError(res.errors[0] || "We couldn't verify this courier's number.");
    setStep("blocked");
  }

  if (step === "splash") {
    return (
      <div
        className="animate-fade-slide-in flex h-full flex-col justify-between px-7 pb-10 text-white"
        style={{ background: APP_BG }}
      >
        <div className="mt-20">
          <div
            className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: ACCENT, color: ACCENT_INK }}
          >
            <span className="material-symbols-outlined text-[22px]">
              local_shipping
            </span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">SwiftDrop</h1>
          <p className="mt-3 max-w-[18rem] text-sm leading-relaxed text-white/70">
            Drive. Drop. Done. Couriers paid daily, jobs verified to the SIM.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ color: ACCENT }}
            >
              shield_person
            </span>
            <p className="text-xs leading-snug text-white/80">
              We verify your number with your carrier so dispatchers know
              it&rsquo;s really you on the road.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setStep("phone")}
            className="w-full rounded-full py-4 text-base font-semibold transition active:scale-[0.98]"
            style={{ background: ACCENT, color: ACCENT_INK }}
          >
            Continue as courier
          </button>
        </div>
      </div>
    );
  }

  if (step === "phone") {
    return (
      <div
        className="animate-fade-slide-in flex h-full flex-col px-6 pb-8 pt-2 text-white"
        style={{ background: APP_BG }}
      >
        <button
          type="button"
          onClick={() => setStep("splash")}
          className="mt-2 inline-flex items-center text-sm text-white/70"
        >
          <span className="material-symbols-outlined text-[20px]">
            arrow_back
          </span>
        </button>

        <h2 className="mt-6 text-2xl font-bold">Sign in to dispatch</h2>
        <p className="mt-1 text-sm text-white/60">
          Enter the number on file with your fleet manager.
        </p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
            Driver phone
          </span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block w-full bg-transparent font-mono text-xl font-semibold tracking-wide outline-none"
          />
        </div>

        <p className="mt-3 text-[11px] text-white/50">
          Demo MSISDN <span className="font-mono">+9999999104</span> follows the
          rehearsal script.
        </p>

        <div className="mt-auto">
          <button
            type="button"
            onClick={verify}
            className="w-full rounded-full py-4 text-base font-semibold transition active:scale-[0.98]"
            style={{ background: ACCENT, color: ACCENT_INK }}
          >
            Verify and start shift
          </button>
        </div>
      </div>
    );
  }

  if (step === "verifying") {
    return (
      <div
        className="animate-fade-slide-in flex h-full flex-col items-center justify-center px-8 text-white"
        style={{ background: APP_BG }}
      >
        <div className="relative mb-6 h-20 w-20">
          <div
            className="absolute inset-0 rounded-full border-4"
            style={{ borderColor: "rgba(255,216,58,0.18)" }}
          />
          <div
            className="absolute inset-0 animate-spin rounded-full border-4 border-t-transparent"
            style={{ borderColor: ACCENT, borderTopColor: "transparent" }}
          />
        </div>
        <p className="text-base font-semibold">Verifying courier</p>
        <p className="mt-2 max-w-xs text-center text-xs text-white/70">
          Confirming SIM, device, and reachability with the carrier through
          NetIQ.
        </p>
      </div>
    );
  }

  return (
    <div
      className="animate-fade-slide-in flex h-full flex-col items-center justify-between px-6 pb-8 pt-16 text-white"
      style={{ background: APP_BG }}
    >
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#3a1414] text-[#ff7a7a]">
          <span className="material-symbols-outlined text-[28px]">block</span>
        </div>
        <h2 className="text-xl font-semibold">Couldn&rsquo;t verify this number</h2>
        <p className="mt-2 max-w-xs text-sm text-white/70">{error}</p>
      </div>
      <button
        type="button"
        onClick={() => setStep("phone")}
        className="w-full rounded-full py-4 text-base font-semibold"
        style={{ background: ACCENT, color: ACCENT_INK }}
      >
        Try a different number
      </button>
    </div>
  );
}

type JobId = "verify_pickup" | "rural_dispatch";

function Home() {
  const { session, signOut } = useDemoSession();
  const runner = useSectorRunner();

  return (
    <div className="relative flex h-full flex-col text-white" style={{ background: APP_BG }}>
      <div className="flex items-center justify-between px-5 pb-2 pt-2">
        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-2xl"
            style={{ background: ACCENT, color: ACCENT_INK }}
          >
            <span className="material-symbols-outlined text-[18px]">
              local_shipping
            </span>
          </div>
          <div className="leading-tight">
            <p className="text-xs text-white/60">On shift</p>
            <p className="font-mono text-[11px]">{session?.phone}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
          aria-label="End shift"
        >
          <span className="material-symbols-outlined text-[18px]">
            logout
          </span>
        </button>
      </div>

      <div className="px-5 pb-4 pt-3">
        <p className="text-[11px] uppercase tracking-wider text-white/60">
          Today
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">Two jobs assigned</h2>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-white/60">
          <span className="inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">
              schedule
            </span>
            Started 9:02 AM
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">
              payments
            </span>
            Daily payout 5 PM
          </span>
        </div>
      </div>

      <div
        className="flex-1 rounded-t-3xl px-4 pb-40 pt-4"
        style={{ background: "#f6f6f4", color: "#0e0f12" }}
      >
        <JobCard
          jobId="verify_pickup"
          tag="SD-4218"
          title="Pickup at Accra hub"
          subtitle="Madina → Osu Castle"
          eta="10 min"
          tone="primary"
          ctaLabel="Confirm pickup at hub"
          runner={runner}
        />
        <div className="h-3" />
        <JobCard
          jobId="rural_dispatch"
          tag="SD-4219"
          title="Rural dispatch — Aburi run"
          subtitle="Madina → Aburi Botanical Gardens"
          eta="42 min"
          tone="muted"
          ctaLabel="Run dispatch readiness"
          runner={runner}
        />

        <p className="mt-6 text-[11px] text-black/50">
          Each tap calls NetIQ&rsquo;s <code className="font-mono">logistics</code>{" "}
          intent. Approval considers location, reachability, and recent risk
          across sectors.
        </p>
      </div>

      <TabBar />
    </div>
  );
}

function JobCard({
  jobId,
  tag,
  title,
  subtitle,
  eta,
  tone,
  ctaLabel,
  runner,
}: {
  jobId: JobId;
  tag: string;
  title: string;
  subtitle: string;
  eta: string;
  tone: "primary" | "muted";
  ctaLabel: string;
  runner: ReturnType<typeof useSectorRunner>;
}) {
  const action = SECTOR.actions.find((a) => a.id === jobId);
  const state = runner.get(jobId);
  const bucket = bucketize(state.decision);

  async function run() {
    if (!action) return;
    await runner.run(jobId, { intent: action.intent, context: action.context });
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.04)] ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-black/90 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white">
          {tag}
        </span>
        <span className="text-[11px] text-black/50">{eta} ETA</span>
      </div>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-0.5 text-xs text-black/60">{subtitle}</p>

      <div className="mt-3 flex items-stretch gap-2">
        <RouteTimeline />
        <div className="flex-1 space-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/50">
              Pickup
            </p>
            <p className="text-xs font-medium">SwiftDrop hub · Accra</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/50">
              Drop
            </p>
            <p className="text-xs font-medium">{subtitle.split(" → ")[1]}</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={state.phase === "running"}
        onClick={() => void run()}
        className="mt-4 w-full rounded-full py-3 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-60"
        style={{
          background: tone === "primary" ? ACCENT : "#0e0f12",
          color: tone === "primary" ? ACCENT_INK : "#ffffff",
        }}
      >
        {state.phase === "running" ? "Asking NetIQ…" : ctaLabel}
      </button>

      {state.phase === "result" && bucket ? (
        <ResultStrip
          bucket={bucket}
          decision={state.decision!}
          action={action!}
        />
      ) : state.error ? (
        <p className="mt-3 text-xs font-medium text-[#a33]">{state.error}</p>
      ) : null}
    </div>
  );
}

function RouteTimeline() {
  return (
    <div className="flex w-3 flex-col items-center justify-between py-1">
      <span className="h-2.5 w-2.5 rounded-full bg-[#0e0f12]" />
      <span className="my-1 w-[2px] flex-1 bg-black/15" />
      <span
        className="h-2.5 w-2.5 rounded-sm"
        style={{ background: ACCENT }}
      />
    </div>
  );
}

function ResultStrip({
  bucket,
  decision,
  action,
}: {
  bucket: "ok" | "verify" | "block";
  decision: NetiqDecision;
  action: (typeof SECTOR.actions)[number];
}) {
  const palette =
    bucket === "ok"
      ? { ring: "#0e7a3b", soft: "#dff6e5", icon: "check_circle", title: "Cleared" }
      : bucket === "verify"
        ? { ring: "#a05a00", soft: "#fdf1d4", icon: "shield", title: "Hold for check" }
        : { ring: "#a33", soft: "#fde2e2", icon: "block", title: "Do not dispatch" };

  const copy =
    bucket === "ok"
      ? action.successCopy
      : bucket === "verify"
        ? action.verifyCopy
        : action.blockCopy;

  const sector = decision.memory_influence?.primary_sector;
  const weight = decision.memory_influence?.global_risk_weight;
  const showMemory =
    typeof weight === "number" && weight > 0 && sector && sector !== "general";

  return (
    <div
      className="mt-3 rounded-xl p-3"
      style={{ background: palette.soft, color: palette.ring }}
    >
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px]">
          {palette.icon}
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide">
          {palette.title}
        </p>
      </div>
      <p className="mt-1.5 text-xs leading-snug text-black/80">{copy}</p>
      {decision.reason ? (
        <p className="mt-1 text-[11px] italic text-black/60">
          &ldquo;{decision.reason}&rdquo;
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
        <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-black/70">
          confidence {Math.round(decision.confidence * 100)}%
        </span>
        <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-black/70">
          risk {decision.risk_score.toFixed(1)}
        </span>
        {showMemory ? (
          <span
            className="rounded-full px-1.5 py-0.5 font-semibold text-white"
            style={{ background: palette.ring }}
          >
            memory · {sector} {Math.round((weight as number) * 100)}%
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TabBar() {
  return (
    <div className="sticky bottom-0 left-0 right-0 z-20 mt-auto flex items-center justify-around border-t border-black/10 bg-white/95 px-5 pb-7 pt-3 backdrop-blur">
      <Tab icon="local_shipping" label="Jobs" active />
      <Tab icon="map" label="Map" />
      <Tab icon="payments" label="Earnings" />
      <Tab icon="account_circle" label="Profile" />
    </div>
  );
}

function Tab({
  icon,
  label,
  active,
}: {
  icon: string;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center text-[10px] font-medium ${
        active ? "" : "text-black/40"
      }`}
      style={active ? { color: ACCENT_INK } : undefined}
    >
      <span className="material-symbols-outlined text-[22px]">{icon}</span>
      <span className="mt-0.5">{label}</span>
    </div>
  );
}
