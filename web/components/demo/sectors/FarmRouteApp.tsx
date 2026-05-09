"use client";

import { useState } from "react";

import { SECTORS } from "@/lib/demo/sectors";
import type { NetiqDecision } from "@/lib/demo/types";
import { bucketize, useSectorRunner } from "@/lib/demo/useSectorRunner";
import { useDemoSession } from "../DemoSessionProvider";
import { PhoneFrame } from "../PhoneFrame";

/**
 * FarmRoute — agritech co-op + field-officer app.
 *
 * Two NetIQ actions: disbursing a fertilizer subsidy (coop_payout) and
 * logging a field-officer visit (field_check_in). Earth-tone visual
 * identity to set it apart from the other three apps.
 */

const SECTOR = SECTORS.agri;
const APP_BG = "#fbf6ec";
const ACCENT = "#3f7d3a";
const ACCENT_DARK = "#1f3a1d";
const SOIL = "#b97a2c";

export function FarmRouteApp() {
  const { session } = useDemoSession();
  return (
    <PhoneFrame bg={APP_BG} statusBarTone="dark">
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
    setError(null);
    setStep("verifying");
    const res = await signIn({ phone, intent: SECTOR.signInIntent });
    if (res.ok) return;
    setError(res.errors[0] || "We couldn't verify this number.");
    setStep("blocked");
  }

  if (step === "splash") {
    return (
      <div
        className="animate-fade-slide-in flex h-full flex-col px-7 pb-10 pt-16"
        style={{ background: APP_BG, color: ACCENT_DARK }}
      >
        <div
          className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl text-white"
          style={{ background: ACCENT }}
        >
          <span className="material-symbols-outlined text-[24px]">
            agriculture
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">FarmRoute</h1>
        <p className="mt-2 max-w-[18rem] text-sm leading-relaxed opacity-80">
          Co-operative tools that work in the field. Subsidies, payouts and
          visits, verified end-to-end.
        </p>

        <div
          className="mt-6 rounded-2xl p-4 ring-1"
          style={{ background: "#fff7e6", color: ACCENT_DARK, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05)" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: SOIL }}>
            Today on the co-op
          </p>
          <p className="mt-1 text-sm font-medium">
            Nyenebi co-op · 132 active farmers · GHS 18,400 in pending payouts
          </p>
        </div>

        <div className="mt-auto space-y-3 pt-10">
          <button
            type="button"
            onClick={() => setStep("phone")}
            className="w-full rounded-2xl py-4 text-base font-semibold text-white"
            style={{ background: ACCENT }}
          >
            Sign in to your co-op
          </button>
          <p className="text-center text-[11px] opacity-60">
            Verified by your network · powered by NetIQ
          </p>
        </div>
      </div>
    );
  }

  if (step === "phone") {
    return (
      <div
        className="animate-fade-slide-in flex h-full flex-col px-6 pb-8 pt-2"
        style={{ background: APP_BG, color: ACCENT_DARK }}
      >
        <button
          type="button"
          onClick={() => setStep("splash")}
          className="mt-2 inline-flex items-center text-sm opacity-70"
        >
          <span className="material-symbols-outlined text-[20px]">
            arrow_back
          </span>
        </button>

        <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70">
          <span className="rounded-full bg-white px-2 py-0.5 font-semibold">
            Step 1 / 2
          </span>
          <span>Officer sign-in</span>
        </div>

        <h2 className="mt-3 text-2xl font-bold">Your number</h2>
        <p className="mt-1 text-sm opacity-70">
          Use the SIM registered with the co-op. We&rsquo;ll do the rest.
        </p>

        <div
          className="mt-6 rounded-2xl border bg-white p-4"
          style={{ borderColor: "rgba(31,58,29,0.10)" }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">
            Field number
          </span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block w-full bg-transparent font-mono text-xl font-semibold tracking-wide outline-none"
          />
        </div>

        <p className="mt-3 text-[11px] opacity-60">
          Use the demo MSISDN <span className="font-mono">+9999999108</span> to
          follow the rehearsal flow.
        </p>

        <div className="mt-auto">
          <button
            type="button"
            onClick={verify}
            className="w-full rounded-2xl py-4 text-base font-semibold text-white"
            style={{ background: ACCENT }}
          >
            Verify with my carrier
          </button>
        </div>
      </div>
    );
  }

  if (step === "verifying") {
    return (
      <div
        className="animate-fade-slide-in flex h-full flex-col items-center justify-center px-8"
        style={{ background: APP_BG, color: ACCENT_DARK }}
      >
        <div className="relative mb-6 h-20 w-20">
          <div
            className="absolute inset-0 rounded-full border-4"
            style={{ borderColor: "rgba(63,125,58,0.18)" }}
          />
          <div
            className="absolute inset-0 animate-spin rounded-full border-4 border-t-transparent"
            style={{ borderColor: ACCENT, borderTopColor: "transparent" }}
          />
        </div>
        <p className="text-base font-semibold">Verifying officer</p>
        <p className="mt-2 max-w-xs text-center text-xs opacity-70">
          Confirming reachability and SIM status with the carrier through the
          NetIQ trust layer.
        </p>
      </div>
    );
  }

  return (
    <div
      className="animate-fade-slide-in flex h-full flex-col items-center justify-between px-6 pb-8 pt-16"
      style={{ background: APP_BG, color: ACCENT_DARK }}
    >
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#fde2e2] text-[#a33]">
          <span className="material-symbols-outlined text-[28px]">block</span>
        </div>
        <h2 className="text-xl font-semibold">Couldn&rsquo;t verify this number</h2>
        <p className="mt-2 max-w-xs text-sm opacity-70">{error}</p>
      </div>
      <button
        type="button"
        onClick={() => setStep("phone")}
        className="w-full rounded-2xl py-4 text-base font-semibold text-white"
        style={{ background: ACCENT }}
      >
        Try a different number
      </button>
    </div>
  );
}

function Home() {
  const { session, signOut } = useDemoSession();
  const runner = useSectorRunner();
  const payout = SECTOR.actions.find((a) => a.id === "coop_payout")!;
  const visit = SECTOR.actions.find((a) => a.id === "field_check_in")!;

  return (
    <div
      className="relative flex h-full flex-col"
      style={{ background: APP_BG, color: ACCENT_DARK }}
    >
      <div className="flex items-center justify-between px-5 pb-2 pt-2">
        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-2xl text-white"
            style={{ background: ACCENT }}
          >
            <span className="material-symbols-outlined text-[18px]">
              eco
            </span>
          </div>
          <div className="leading-tight">
            <p className="text-[11px] opacity-60">Field officer</p>
            <p className="text-sm font-semibold">Yaw Boateng</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white"
          aria-label="Sign out"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
        </button>
      </div>

      <div className="px-5 pt-3">
        <p className="text-[11px] opacity-60">Nyenebi co-op · Kumasi</p>
        <h2 className="mt-1 text-2xl font-bold leading-tight">
          2 tasks today
        </h2>
        <p className="mt-1 text-xs opacity-70">
          Signed in as <span className="font-mono">{session?.phone}</span>
        </p>
      </div>

      <div
        className="mx-5 mt-4 rounded-2xl p-4 text-white"
        style={{ background: ACCENT }}
      >
        <p className="text-[11px] uppercase tracking-wider opacity-80">
          Pending payouts
        </p>
        <p className="mt-1 text-2xl font-bold">GHS 18,400</p>
        <p className="text-[11px] opacity-80">across 14 farmers</p>
      </div>

      <div className="px-5 pb-40 pt-5">
        <PayoutCard action={payout} runner={runner} />
        <div className="h-3" />
        <VisitCard action={visit} runner={runner} />

        <p className="mt-5 text-[11px] opacity-60">
          NetIQ&rsquo;s <code className="font-mono">agri</code> intent checks
          reachability + location + cross-sector risk before any cedi or visit
          is logged.
        </p>
      </div>

      <TabBar />
    </div>
  );
}

function PayoutCard({
  action,
  runner,
}: {
  action: (typeof SECTOR.actions)[number];
  runner: ReturnType<typeof useSectorRunner>;
}) {
  const state = runner.get("coop_payout");
  const bucket = bucketize(state.decision);

  async function send() {
    await runner.run("coop_payout", {
      intent: action.intent,
      context: action.context,
    });
  }

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider opacity-60">
            Subsidy disbursement
          </p>
          <h3 className="mt-1 text-base font-semibold">
            Pay Kwabena Owusu — fertilizer
          </h3>
          <p className="mt-0.5 text-xs opacity-70">
            2.5 ha maize · Adwoa village
          </p>
        </div>
        <span
          className="material-symbols-outlined text-[22px]"
          style={{ color: SOIL }}
        >
          payments
        </span>
      </div>

      <div
        className="mt-3 grid grid-cols-2 gap-2 rounded-xl border p-3 text-xs"
        style={{ borderColor: "rgba(31,58,29,0.10)", background: "#fff7e6" }}
      >
        <Stat label="Amount" value="GHS 500" />
        <Stat label="Wallet" value="MTN MoMo" />
        <Stat label="Farm" value="Kumasi region" />
        <Stat label="Cycle" value="Q3 subsidy" />
      </div>

      <button
        type="button"
        disabled={state.phase === "running"}
        onClick={() => void send()}
        className="mt-3 w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: ACCENT }}
      >
        {state.phase === "running" ? "Asking NetIQ…" : "Disburse 500 GHS"}
      </button>

      {state.phase === "result" && bucket ? (
        <ResultStrip
          bucket={bucket}
          decision={state.decision!}
          successCopy={action.successCopy}
          verifyCopy={action.verifyCopy}
          blockCopy={action.blockCopy}
        />
      ) : state.error ? (
        <p className="mt-3 text-xs font-medium text-[#a33]">{state.error}</p>
      ) : null}
    </div>
  );
}

function VisitCard({
  action,
  runner,
}: {
  action: (typeof SECTOR.actions)[number];
  runner: ReturnType<typeof useSectorRunner>;
}) {
  const state = runner.get("field_check_in");
  const bucket = bucketize(state.decision);

  async function checkIn() {
    await runner.run("field_check_in", {
      intent: action.intent,
      context: action.context,
    });
  }

  return (
    <div
      className="rounded-2xl p-4 ring-1"
      style={{
        background: "#ffffff",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider opacity-60">
            Field log
          </p>
          <h3 className="mt-1 text-base font-semibold">
            Log visit at Adwoa&rsquo;s plot
          </h3>
          <p className="mt-0.5 text-xs opacity-70">
            6.6885°N, 1.6244°W · Kumasi region
          </p>
        </div>
        <span
          className="material-symbols-outlined text-[22px]"
          style={{ color: ACCENT }}
        >
          location_on
        </span>
      </div>

      <div
        className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[11px]"
        style={{ background: "rgba(63,125,58,0.10)", color: ACCENT_DARK }}
      >
        <span className="material-symbols-outlined text-[14px]">
          satellite_alt
        </span>
        We&rsquo;ll match the SIM&rsquo;s carrier location to this plot.
      </div>

      <button
        type="button"
        disabled={state.phase === "running"}
        onClick={() => void checkIn()}
        className="mt-3 w-full rounded-xl border py-3 text-sm font-semibold disabled:opacity-60"
        style={{ borderColor: ACCENT, color: ACCENT }}
      >
        {state.phase === "running" ? "Asking NetIQ…" : "Confirm visit"}
      </button>

      {state.phase === "result" && bucket ? (
        <ResultStrip
          bucket={bucket}
          decision={state.decision!}
          successCopy={action.successCopy}
          verifyCopy={action.verifyCopy}
          blockCopy={action.blockCopy}
        />
      ) : state.error ? (
        <p className="mt-3 text-xs font-medium text-[#a33]">{state.error}</p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider opacity-50">{label}</p>
      <p className="text-xs font-semibold">{value}</p>
    </div>
  );
}

function ResultStrip({
  bucket,
  decision,
  successCopy,
  verifyCopy,
  blockCopy,
}: {
  bucket: "ok" | "verify" | "block";
  decision: NetiqDecision;
  successCopy: string;
  verifyCopy: string;
  blockCopy: string;
}) {
  const palette =
    bucket === "ok"
      ? { ring: "#0e7a3b", soft: "#dff6e5", icon: "check_circle", title: "Approved" }
      : bucket === "verify"
        ? { ring: "#a05a00", soft: "#fdf1d4", icon: "shield", title: "Hold for review" }
        : { ring: "#a33", soft: "#fde2e2", icon: "block", title: "Do not pay / log" };

  const copy =
    bucket === "ok" ? successCopy : bucket === "verify" ? verifyCopy : blockCopy;

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
      <Tab icon="agriculture" label="Today" active />
      <Tab icon="payments" label="Payouts" />
      <Tab icon="map" label="Plots" />
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
      className="flex flex-col items-center text-[10px] font-medium"
      style={{ color: active ? ACCENT : "rgba(31,58,29,0.45)" }}
    >
      <span className="material-symbols-outlined text-[22px]">{icon}</span>
      <span className="mt-0.5">{label}</span>
    </div>
  );
}
