"use client";

import { useState } from "react";

import { SECTORS } from "@/lib/demo/sectors";
import type { NetiqDecision } from "@/lib/demo/types";
import { bucketize, useSectorRunner } from "@/lib/demo/useSectorRunner";
import { useDemoSession } from "../DemoSessionProvider";
import { PhoneFrame } from "../PhoneFrame";

/**
 * CareLink — telehealth mobile app. Calm clinical look.
 *
 * Onboarding mimics a patient app sign-up flow ("Welcome", phone capture,
 * verifying with carrier, ready). Home shows an upcoming consult card and
 * an "Identity required for prescriptions" card — the two NetIQ actions.
 */

const SECTOR = SECTORS.health;
const APP_BG = "#eef5fb";
const ACCENT = "#1f6f99";
const ACCENT_DARK = "#0f3a55";

export function CareLinkApp() {
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
            stethoscope
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">CareLink</h1>
        <p className="mt-2 max-w-[18rem] text-sm leading-relaxed opacity-80">
          Talk to a doctor in 60 seconds. Prescriptions filled and verified
          before pickup.
        </p>

        <ul className="mt-6 space-y-3 text-sm">
          <Bullet icon="bolt" text="Same-day video consults from GHS 25" />
          <Bullet icon="local_pharmacy" text="Prescriptions delivered to your block" />
          <Bullet icon="verified_user" text="Identity verified by your carrier" />
        </ul>

        <div className="mt-auto space-y-3 pt-10">
          <button
            type="button"
            onClick={() => setStep("phone")}
            className="w-full rounded-2xl py-4 text-base font-semibold text-white"
            style={{ background: ACCENT }}
          >
            Continue
          </button>
          <p className="text-center text-[11px] opacity-60">
            By continuing you agree to CareLink&rsquo;s terms and privacy policy.
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

        <Step n={1} of={2} label="Sign in" />

        <h2 className="mt-3 text-2xl font-bold">Welcome back</h2>
        <p className="mt-1 text-sm opacity-70">
          We&rsquo;ll text you for appointment reminders only. Promise.
        </p>

        <div
          className="mt-6 rounded-2xl border bg-white p-4"
          style={{ borderColor: "rgba(15,58,85,0.10)" }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">
            Mobile number
          </span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block w-full bg-transparent font-mono text-xl font-semibold tracking-wide outline-none"
          />
        </div>

        <div
          className="mt-4 rounded-xl px-3 py-2 text-[11px] leading-snug"
          style={{ background: "rgba(31,111,153,0.10)", color: ACCENT_DARK }}
        >
          <span className="font-semibold">Why we ask:</span> NetIQ checks your
          carrier record to make sure no one else is taking over your medical
          history.
        </div>

        <div className="mt-auto">
          <button
            type="button"
            onClick={verify}
            className="w-full rounded-2xl py-4 text-base font-semibold text-white"
            style={{ background: ACCENT }}
          >
            Verify and continue
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
            style={{ borderColor: "rgba(31,111,153,0.18)" }}
          />
          <div
            className="absolute inset-0 animate-spin rounded-full border-4 border-t-transparent"
            style={{ borderColor: ACCENT, borderTopColor: "transparent" }}
          />
        </div>
        <p className="text-base font-semibold">Verifying with your carrier</p>
        <p className="mt-2 max-w-xs text-center text-xs opacity-70">
          Confirming your line is healthy and not being recycled — one moment.
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
        <h2 className="text-xl font-semibold">We can&rsquo;t open your account</h2>
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

function Bullet({ icon, text }: { icon: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-white"
        style={{ background: ACCENT }}
      >
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
      </span>
      <span className="leading-snug">{text}</span>
    </li>
  );
}

function Step({ n, of, label }: { n: number; of: number; label: string }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70">
      <span className="rounded-full bg-white px-2 py-0.5 font-semibold">
        Step {n} / {of}
      </span>
      <span>{label}</span>
    </div>
  );
}

function Home() {
  const { session, signOut } = useDemoSession();
  const runner = useSectorRunner();

  const consult = SECTOR.actions.find((a) => a.id === "start_consult")!;
  const verify = SECTOR.actions.find((a) => a.id === "verify_patient")!;
  const consultState = runner.get("start_consult");
  const verifyState = runner.get("verify_patient");

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
              stethoscope
            </span>
          </div>
          <div className="leading-tight">
            <p className="text-[11px] opacity-60">Patient</p>
            <p className="text-sm font-semibold">Ama Mensah</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white"
          aria-label="Sign out"
        >
          <span className="material-symbols-outlined text-[18px]">
            logout
          </span>
        </button>
      </div>

      <div className="px-5 pt-3">
        <p className="text-[11px] opacity-60">Good morning,</p>
        <h2 className="mt-1 text-2xl font-bold leading-tight">Ama</h2>
        <p className="mt-1 text-xs opacity-70">
          Signed in as <span className="font-mono">{session?.phone}</span>
        </p>
      </div>

      <div className="px-5 pb-3 pt-5">
        <ConsultCard action={consult} state={consultState} runner={runner} />
      </div>

      <div className="px-5 pb-40">
        <VerifyCard action={verify} state={verifyState} runner={runner} />

        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Quick icon="medication" label="Refill" />
          <Quick icon="science" label="Lab" />
          <Quick icon="schedule" label="Book" />
        </div>

        <p className="mt-4 text-[11px] opacity-60">
          NetIQ&rsquo;s <code className="font-mono">health</code> intent runs
          reachability + QoS for the consult and matches your KYC for the
          prescription identity check.
        </p>
      </div>

      <TabBar />
    </div>
  );
}

function ConsultCard({
  action,
  state,
  runner,
}: {
  action: (typeof SECTOR.actions)[number];
  state: ReturnType<ReturnType<typeof useSectorRunner>["get"]>;
  runner: ReturnType<typeof useSectorRunner>;
}) {
  const bucket = bucketize(state.decision);

  async function start() {
    await runner.run("start_consult", {
      intent: action.intent,
      context: action.context,
    });
  }

  return (
    <div
      className="overflow-hidden rounded-2xl text-white shadow-md"
      style={{ background: ACCENT }}
    >
      <div className="px-5 pt-5">
        <p className="text-[11px] uppercase tracking-wider opacity-80">
          Upcoming consult · in 8 minutes
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white">
            <span className="material-symbols-outlined text-[24px]">
              person
            </span>
          </div>
          <div>
            <p className="text-base font-semibold">Dr. Kojo Asante</p>
            <p className="text-[11px] opacity-80">General practitioner</p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-4">
        <button
          type="button"
          disabled={state.phase === "running"}
          onClick={() => void start()}
          className="w-full rounded-xl bg-white py-3 text-sm font-semibold disabled:opacity-60"
          style={{ color: ACCENT_DARK }}
        >
          {state.phase === "running" ? "Checking call quality…" : "Join video call"}
        </button>
      </div>

      <div className="px-5 pb-4 pt-3 text-[11px] opacity-80">
        We check reachability and QoS before you join so the call doesn&rsquo;t
        drop.
      </div>

      {state.phase === "result" && bucket ? (
        <ResultStrip
          bucket={bucket}
          decision={state.decision!}
          successCopy={action.successCopy}
          verifyCopy={action.verifyCopy}
          blockCopy={action.blockCopy}
          onLight
        />
      ) : state.error ? (
        <p className="px-5 pb-4 text-xs font-medium text-[#ffd1d1]">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

function VerifyCard({
  action,
  state,
  runner,
}: {
  action: (typeof SECTOR.actions)[number];
  state: ReturnType<ReturnType<typeof useSectorRunner>["get"]>;
  runner: ReturnType<typeof useSectorRunner>;
}) {
  const bucket = bucketize(state.decision);

  async function verify() {
    await runner.run("verify_patient", {
      intent: action.intent,
      context: action.context,
    });
  }

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider opacity-60">
            Pharmacy needs ID
          </p>
          <h3 className="mt-1 text-base font-semibold">Verify identity for prescriptions</h3>
          <p className="mt-1 text-xs opacity-70">
            Matches the name and DOB you signed up with against the carrier&rsquo;s
            KYC record. No upload needed.
          </p>
        </div>
        <span
          className="material-symbols-outlined text-[22px]"
          style={{ color: ACCENT }}
        >
          badge
        </span>
      </div>

      <div
        className="mt-3 rounded-xl border p-3 text-xs"
        style={{ borderColor: "rgba(15,58,85,0.10)", background: "#f5f9fc" }}
      >
        <Row label="Name" value="Ama Mensah" />
        <Row label="DOB" value="12 Apr 1995" />
        <Row label="Number" value="✓ verified by carrier" />
      </div>

      <button
        type="button"
        disabled={state.phase === "running"}
        onClick={() => void verify()}
        className="mt-3 w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: ACCENT_DARK }}
      >
        {state.phase === "running" ? "Verifying with carrier…" : "Verify identity"}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="opacity-60">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ResultStrip({
  bucket,
  decision,
  successCopy,
  verifyCopy,
  blockCopy,
  onLight,
}: {
  bucket: "ok" | "verify" | "block";
  decision: NetiqDecision;
  successCopy: string;
  verifyCopy: string;
  blockCopy: string;
  onLight?: boolean;
}) {
  const palette =
    bucket === "ok"
      ? { ring: "#0e7a3b", soft: "#dff6e5", icon: "check_circle", title: "Approved" }
      : bucket === "verify"
        ? { ring: "#a05a00", soft: "#fdf1d4", icon: "shield", title: "Step-up needed" }
        : { ring: "#a33", soft: "#fde2e2", icon: "block", title: "Cannot proceed" };

  const copy =
    bucket === "ok" ? successCopy : bucket === "verify" ? verifyCopy : blockCopy;

  const sector = decision.memory_influence?.primary_sector;
  const weight = decision.memory_influence?.global_risk_weight;
  const showMemory =
    typeof weight === "number" && weight > 0 && sector && sector !== "general";

  return (
    <div
      className={`mt-3 rounded-xl p-3 ${onLight ? "mx-5 mb-4" : ""}`}
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

function Quick({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-white py-3 ring-1 ring-black/5">
      <span
        className="material-symbols-outlined text-[20px]"
        style={{ color: ACCENT }}
      >
        {icon}
      </span>
      <span className="mt-1 text-[11px] font-medium" style={{ color: ACCENT_DARK }}>
        {label}
      </span>
    </div>
  );
}

function TabBar() {
  return (
    <div className="sticky bottom-0 left-0 right-0 z-20 mt-auto flex items-center justify-around border-t border-black/10 bg-white/95 px-5 pb-7 pt-3 backdrop-blur">
      <Tab icon="home" label="Home" active />
      <Tab icon="calendar_today" label="Visits" />
      <Tab icon="medication" label="Meds" />
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
      style={{ color: active ? ACCENT : "rgba(15,58,85,0.45)" }}
    >
      <span className="material-symbols-outlined text-[22px]">{icon}</span>
      <span className="mt-0.5">{label}</span>
    </div>
  );
}
