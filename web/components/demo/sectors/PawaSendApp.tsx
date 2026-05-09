"use client";

import { useState } from "react";

import { SECTORS } from "@/lib/demo/sectors";
import type { NetiqDecision } from "@/lib/demo/types";
import {
  bucketize,
  useResetOnOpen,
  useSectorRunner,
} from "@/lib/demo/useSectorRunner";
import { useDemoSession } from "../DemoSessionProvider";
import { PhoneFrame } from "../PhoneFrame";

/**
 * PawaSend — Cash App-inspired mobile-money app.
 *
 * Onboarding (splash → phone → verifying → success/blocked) is the NetIQ
 * sign-in flow. Two "Suggested for you" cards on the Home screen are the
 * two NetIQ-gated actions: a small (quick_send) and a large (high_value)
 * transfer. Tapping a card opens a bottom sheet that runs the action and
 * shows the decision in-context.
 */

const SECTOR = SECTORS.fintech;
const BRAND = "#00d54b";
const BRAND_INK = "#003a13";

export function PawaSendApp() {
  const { session } = useDemoSession();
  return (
    <PhoneFrame bg={BRAND} statusBarTone="light">
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
    setError(res.errors[0] || "We couldn't verify this number with the network.");
    setStep("blocked");
  }

  if (step === "splash") {
    return (
      <div
        className="animate-fade-slide-in flex h-full flex-col items-center justify-between px-7 pb-10 text-white"
        style={{ background: BRAND }}
      >
        <div className="mt-24 flex flex-col items-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 shadow-inner">
            <span className="text-[44px] font-black leading-none">₵</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">PawaSend</h1>
          <p className="mt-2 text-center text-sm opacity-80">
            Send and receive cedis instantly.
          </p>
        </div>

        <div className="w-full space-y-3">
          <button
            type="button"
            onClick={() => setStep("phone")}
            className="w-full rounded-full bg-white py-4 text-base font-semibold transition active:scale-[0.98]"
            style={{ color: BRAND_INK }}
          >
            Get started
          </button>
          <p className="text-center text-[11px] opacity-70">
            Verified by your network · powered by NetIQ
          </p>
        </div>
      </div>
    );
  }

  if (step === "phone") {
    return (
      <div
        className="animate-fade-slide-in flex h-full flex-col px-6 pb-8 pt-2 text-white"
        style={{ background: BRAND }}
      >
        <button
          type="button"
          onClick={() => setStep("splash")}
          className="mt-2 inline-flex items-center text-sm text-white/85"
        >
          <span className="material-symbols-outlined text-[20px]">
            arrow_back
          </span>
        </button>

        <h2 className="mt-6 text-2xl font-bold leading-tight">
          What&rsquo;s your number?
        </h2>
        <p className="mt-1 text-sm text-white/80">
          We&rsquo;ll verify it with your carrier. No SMS code needed.
        </p>

        <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
            Mobile number
          </span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block w-full bg-transparent font-mono text-xl font-semibold tracking-wide text-white outline-none placeholder:text-white/40"
          />
        </div>

        <p className="mt-3 text-[11px] text-white/70">
          Use a simulator MSISDN like{" "}
          <span className="font-mono">+9999999103</span> to follow the demo
          script.
        </p>

        <div className="mt-auto">
          <button
            type="button"
            onClick={verify}
            className="w-full rounded-full bg-white py-4 text-base font-semibold transition active:scale-[0.98]"
            style={{ color: BRAND_INK }}
          >
            Continue
          </button>
          <p className="mt-3 text-center text-[10px] text-white/70">
            By tapping continue you agree to PawaSend&rsquo;s terms.
          </p>
        </div>
      </div>
    );
  }

  if (step === "verifying") {
    return (
      <div
        className="animate-fade-slide-in flex h-full flex-col items-center justify-center px-8 text-white"
        style={{ background: BRAND }}
      >
        <div className="relative mb-6 h-20 w-20">
          <div className="absolute inset-0 rounded-full border-4 border-white/20" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-white border-t-transparent" />
        </div>
        <p className="text-base font-semibold">Verifying your number</p>
        <p className="mt-2 max-w-xs text-center text-xs opacity-80">
          Checking SIM, device, and reachability with your carrier through the
          NetIQ trust layer.
        </p>
      </div>
    );
  }

  return (
    <div
      className="animate-fade-slide-in flex h-full flex-col items-center justify-between px-6 pb-8 pt-16 text-white"
      style={{ background: BRAND }}
    >
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-white">
          <span className="material-symbols-outlined text-[28px]">block</span>
        </div>
        <h2 className="text-xl font-semibold">We couldn&rsquo;t verify you</h2>
        <p className="mt-2 max-w-xs text-sm text-white/80">{error}</p>
      </div>

      <div className="w-full space-y-3">
        <button
          type="button"
          onClick={() => setStep("phone")}
          className="w-full rounded-full bg-white py-4 text-base font-semibold"
          style={{ color: BRAND_INK }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}

type SuggestionId = "quick_send" | "high_value";

function Home() {
  const { session, signOut } = useDemoSession();
  const [open, setOpen] = useState<SuggestionId | null>(null);
  const runner = useSectorRunner();

  return (
    <div className="relative flex h-full flex-col text-white" style={{ background: BRAND }}>
      <div className="flex items-center justify-between px-5 pb-2 pt-2">
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"
          aria-label="Sign out"
        >
          <span className="material-symbols-outlined text-[18px]">person</span>
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"
          aria-label="Notifications"
        >
          <span className="material-symbols-outlined text-[18px]">
            notifications
          </span>
        </button>
      </div>

      <div className="px-5 pb-6 pt-2">
        <p className="text-[11px] uppercase tracking-wider opacity-80">
          Available balance
        </p>
        <p className="mt-1 text-4xl font-bold tracking-tight">GHS 1,247.90</p>
        <p className="mt-1 font-mono text-[11px] opacity-70">{session?.phone}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pb-5">
        <Tile icon="north_east" label="Send" />
        <Tile icon="south_west" label="Receive" />
      </div>

      <div
        className="flex-1 rounded-t-3xl px-5 pb-40 pt-5"
        style={{ background: "#ffffff", color: BRAND_INK }}
      >
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Suggested for you</h3>
          <span className="text-[10px] opacity-60">NetIQ-gated</span>
        </div>
        <p className="mt-0.5 text-xs opacity-60">
          Tap to send. We&rsquo;ll run a network-trust check first.
        </p>

        <div className="mt-3 space-y-3">
          <Suggestion
            avatar="A"
            name="Ama Mensah"
            note="Lunch yesterday"
            amount="25"
            tone="default"
            onClick={() => setOpen("quick_send")}
          />
          <Suggestion
            avatar="K"
            name="Kweku Properties"
            note="Rent — September"
            amount="12,000"
            tone="serious"
            onClick={() => setOpen("high_value")}
          />
        </div>

        <h3 className="mt-7 text-sm font-semibold">Recent activity</h3>
        <div className="mt-2 divide-y divide-black/5">
          <Recent
            icon="bolt"
            label="Bolt ride"
            sub="Yesterday · 4:21 PM"
            amount="-12.50"
          />
          <Recent
            icon="south_west"
            label="Yaw paid you"
            sub="2 days ago"
            amount="+45.00"
            credit
          />
          <Recent
            icon="north_east"
            label="MTN airtime"
            sub="3 days ago"
            amount="-20.00"
          />
        </div>
      </div>

      <TabBar />

      <ActionSheet
        actionId={open}
        onClose={() => setOpen(null)}
        runner={runner}
      />
    </div>
  );
}

function Tile({ icon, label }: { icon: string; label: string }) {
  return (
    <button
      type="button"
      className="flex flex-col items-center justify-center rounded-2xl bg-white/15 py-3 text-white transition active:scale-[0.99]"
    >
      <span className="material-symbols-outlined text-[22px]">{icon}</span>
      <span className="mt-1 text-xs font-medium">{label}</span>
    </button>
  );
}

function Suggestion({
  avatar,
  name,
  note,
  amount,
  tone,
  onClick,
}: {
  avatar: string;
  name: string;
  note: string;
  amount: string;
  tone: "default" | "serious";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl border border-black/5 bg-[#f5f9f3] p-3 text-left transition active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: tone === "serious" ? BRAND_INK : BRAND }}
        >
          {avatar}
        </div>
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-[11px] opacity-60">{note}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold">GHS {amount}</p>
        <p className="text-[10px] uppercase tracking-wide opacity-50">
          Send →
        </p>
      </div>
    </button>
  );
}

function Recent({
  icon,
  label,
  sub,
  amount,
  credit,
}: {
  icon: string;
  label: string;
  sub: string;
  amount: string;
  credit?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5">
          <span className="material-symbols-outlined text-[16px]">{icon}</span>
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-[11px] opacity-60">{sub}</p>
        </div>
      </div>
      <p
        className="text-sm font-semibold"
        style={{ color: credit ? "#0e7a3b" : BRAND_INK }}
      >
        {amount}
      </p>
    </div>
  );
}

function TabBar() {
  return (
    <div className="sticky bottom-0 left-0 right-0 z-20 mt-auto flex items-center justify-around border-t border-black/5 bg-white/95 px-5 pb-7 pt-3 backdrop-blur">
      <TabItem icon="home" label="Home" active />
      <TabItem icon="credit_card" label="Card" />
      <TabItem icon="receipt_long" label="Activity" />
      <TabItem icon="settings" label="Settings" />
    </div>
  );
}

function TabItem({
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
        active ? "" : "opacity-40"
      }`}
      style={{ color: active ? BRAND : BRAND_INK }}
    >
      <span className="material-symbols-outlined text-[22px]">{icon}</span>
      <span className="mt-0.5">{label}</span>
    </div>
  );
}

function ActionSheet({
  actionId,
  onClose,
  runner,
}: {
  actionId: SuggestionId | null;
  onClose: () => void;
  runner: ReturnType<typeof useSectorRunner>;
}) {
  useResetOnOpen(actionId, runner.reset);

  if (!actionId) return null;

  const action = SECTOR.actions.find((a) => a.id === actionId);
  if (!action) return null;

  const state = runner.get(actionId);
  const bucket = bucketize(state.decision);
  const recipient =
    actionId === "quick_send" ? "Ama Mensah" : "Kweku Properties";
  const amount = actionId === "quick_send" ? "25.00" : "12,000.00";

  async function send() {
    await runner.run(actionId!, {
      intent: action!.intent,
      context: action!.context,
    });
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
      />
      <div
        className="animate-fade-slide-in relative rounded-t-3xl bg-white pb-8"
        style={{ color: BRAND_INK }}
      >
        <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-black/15" />

        <div className="px-6 pt-4">
          <p className="text-[11px] uppercase tracking-wider opacity-60">
            {actionId === "high_value" ? "High-value transfer" : "Send money"}
          </p>
          <h3 className="mt-1 text-2xl font-bold">GHS {amount}</h3>
          <p className="mt-1 text-sm opacity-70">to {recipient}</p>
        </div>

        <div className="mx-6 mt-5 rounded-2xl border border-black/5 bg-[#f5f9f3] p-3">
          {state.phase === "running" ? (
            <div className="flex items-center gap-3">
              <div className="relative h-5 w-5">
                <div
                  className="absolute inset-0 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: BRAND, borderTopColor: "transparent" }}
                />
              </div>
              <p className="text-xs font-medium">
                Asking NetIQ to verify the network trust on this transfer…
              </p>
            </div>
          ) : state.phase === "result" && bucket ? (
            <ResultBlock
              bucket={bucket}
              decision={state.decision!}
              successCopy={action.successCopy}
              verifyCopy={action.verifyCopy}
              blockCopy={action.blockCopy}
            />
          ) : state.error ? (
            <p className="text-xs font-medium text-[#a33]">{state.error}</p>
          ) : (
            <div className="flex items-start gap-2">
              <span
                className="material-symbols-outlined mt-0.5 text-[18px]"
                style={{ color: BRAND }}
              >
                verified_user
              </span>
              <p className="text-xs leading-snug opacity-80">
                Before we send, NetIQ checks the SIM, device, and recent risk
                signals on the sender&rsquo;s line.
              </p>
            </div>
          )}
        </div>

        <div className="mx-6 mt-5 flex items-center justify-between text-[11px] opacity-60">
          <span>From PawaSend balance</span>
          <span>Free transfer · arrives instantly</span>
        </div>

        <div className="mt-4 px-6">
          {state.phase === "result" ? (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-full py-4 text-base font-semibold text-white"
              style={{ background: BRAND_INK }}
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              disabled={state.phase === "running"}
              onClick={() => void send()}
              className="w-full rounded-full py-4 text-base font-semibold text-white disabled:opacity-60"
              style={{ background: BRAND }}
            >
              {state.phase === "running" ? "Verifying…" : `Send GHS ${amount}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultBlock({
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
        ? { ring: "#a05a00", soft: "#fdf1d4", icon: "shield", title: "Step-up required" }
        : { ring: "#a33", soft: "#fde2e2", icon: "block", title: "Blocked" };

  const copy =
    bucket === "ok" ? successCopy : bucket === "verify" ? verifyCopy : blockCopy;

  const sector = decision?.memory_influence?.primary_sector;
  const weight = decision?.memory_influence?.global_risk_weight;
  const showMemory =
    typeof weight === "number" && weight > 0 && sector && sector !== "general";

  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined text-[20px]"
          style={{ color: palette.ring }}
        >
          {palette.icon}
        </span>
        <p className="text-sm font-semibold">{palette.title}</p>
      </div>
      <p className="mt-2 text-xs leading-snug opacity-80">{copy}</p>
      {decision?.reason ? (
        <p className="mt-2 text-[11px] italic opacity-70">
          &ldquo;{decision.reason}&rdquo;
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] opacity-70">
        <Pill>confidence {Math.round((decision?.confidence ?? 0) * 100)}%</Pill>
        <Pill>risk {decision?.risk_score?.toFixed(1)}</Pill>
        {showMemory ? (
          <Pill highlight>
            memory · {sector} {Math.round((weight as number) * 100)}%
          </Pill>
        ) : null}
      </div>
    </div>
  );
}

function Pill({
  children,
  highlight,
}: {
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 ${
        highlight
          ? "bg-[#003a13] text-white"
          : "bg-black/5 text-[#003a13]"
      }`}
    >
      {children}
    </span>
  );
}
