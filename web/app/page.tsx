"use client";

import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NETIQ_PRODUCTION_API_ORIGIN } from "@/lib/api";

type Tab = "rest" | "mcp" | "a2a";

const REST_SNIPPET = `curl -X POST ${NETIQ_PRODUCTION_API_ORIGIN}/decision/run \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "intent": "fraud_prevention", "phone": "+233201234567", "mode": "agent" }'

# response
{
  "decision": "ALLOW",
  "confidence": 0.94,
  "risk_score": 8.2,
  "selected_agents": ["RiskAgent", "NetworkAgent"],
  "memory_influence": { "global_risk_weight": 0.85, "primary_sector": "finance" }
}`;

const MCP_SNIPPET = `// Add to claude_desktop_config.json
{
  "mcpServers": {
    "netiq": {
      "command": "python",
      "args": ["/path/to/netiq/mcp_server.py"],
      "env": { "NETIQ_API_KEY": "ntq_..." }
    }
  }
}

// Now an LLM agent can simply call:
//   decide({ intent: "fraud_prevention", phone: "+233201234567", mode: "agent" })
// and NetIQ orchestrates the right CAMARA APIs internally.`;

const A2A_SNIPPET = `# 1. Discover NetIQ via its Agent Card
curl ${NETIQ_PRODUCTION_API_ORIGIN}/.well-known/agent.json

# 2. Send a task as one agent to another
curl -X POST ${NETIQ_PRODUCTION_API_ORIGIN}/a2a/tasks/send \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "id": "task-001",
    "message": {
      "role": "user",
      "parts": [{ "type": "data", "data": {
        "skill": "decide",
        "intent": "fraud_prevention",
        "phone": "+233201234567"
      } }]
    }
  }'`;

const STATS = [
  { value: "11+", label: "business intents" },
  { value: "3", label: "protocol surfaces" },
  { value: "16+", label: "CAMARA signals" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("rest");

  return (
    <div className="bg-background text-on-background min-h-screen">
      <nav className="border-outline-variant bg-background/75 supports-[backdrop-filter]:bg-background/60 fixed top-0 z-50 w-full border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:h-16 sm:px-6">
          <Link
            href="/"
            className="font-[family-name:var(--font-space-grotesk)] text-on-surface text-lg font-semibold tracking-tight sm:text-xl"
          >
            NetIQ
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/demo"
              className="text-on-surface-variant hover:text-on-surface hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors sm:inline-flex"
            >
              <span className="material-symbols-outlined text-[18px] leading-none">apps</span>
              Demos
            </Link>
            <Link
              href="/ask"
              className="text-on-surface-variant hover:text-on-surface hidden text-sm transition-colors md:inline"
            >
              Ask
            </Link>
            <ThemeToggle />
            <Link
              href="/login"
              className="bg-primary text-on-primary hover:opacity-92 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium shadow-sm transition-opacity"
            >
              Sign in
              <span className="material-symbols-outlined text-[16px] leading-none">arrow_forward</span>
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-14 sm:pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden px-5 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-20 md:pt-24">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            aria-hidden
          >
            <div className="bg-primary/8 absolute -left-1/4 top-0 h-[420px] w-[70%] rounded-full blur-[100px] sm:h-[520px]" />
            <div className="bg-on-surface-variant/15 absolute -right-1/4 top-24 h-[320px] w-[55%] rounded-full blur-[90px]" />
            <div
              className="absolute inset-0 opacity-[0.35] dark:opacity-[0.22]"
              style={{
                backgroundImage: `linear-gradient(var(--color-outline-variant) 1px, transparent 1px),
                  linear-gradient(90deg, var(--color-outline-variant) 1px, transparent 1px)`,
                backgroundSize: "48px 48px",
              }}
            />
          </div>

          <div className="mx-auto max-w-4xl text-center">
            <p className="text-on-surface-variant inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] backdrop-blur-sm sm:text-xs">
              <span className="bg-success h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />
              Nokia Network as Code · CAMARA
            </p>
            <h1 className="font-[family-name:var(--font-space-grotesk)] text-on-surface mt-8 text-[2.35rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl lg:text-[3.5rem]">
              Turn raw signal into
              <span className="text-on-surface-variant font-normal"> — </span>
              <span className="from-on-surface to-on-surface-variant bg-gradient-to-br bg-clip-text text-transparent">
                live decisions
              </span>
              <br />
              for AI agents.
            </h1>
            <p className="text-on-surface-variant mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg">
              One orchestration layer over GSMA CAMARA: express{" "}
              <code className="bg-surface-container-high text-on-surface rounded px-1.5 py-0.5 font-mono text-[0.85em]">
                intent + phone
              </code>
              , get{" "}
              <span className="text-on-surface font-medium">ALLOW · VERIFY · BLOCK</span> with confidence, trace, and
              cross-sector memory — over REST, MCP, or A2A.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/login"
                className="bg-primary text-on-primary hover:opacity-92 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold shadow-md transition-opacity sm:w-auto sm:min-w-[200px]"
              >
                Sign in to console
                <span className="material-symbols-outlined text-[18px] leading-none">login</span>
              </Link>
              <Link
                href="/ask"
                className="border-outline-variant text-on-surface hover:bg-surface-container-low inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border bg-transparent px-8 text-sm font-medium transition-colors sm:w-auto"
              >
                <span className="material-symbols-outlined text-[18px] leading-none">chat_bubble</span>
                Try /ask — no signup
              </Link>
              <Link
                href="/demo"
                className="border-outline-variant text-on-surface hover:bg-surface-container-low inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border px-8 text-sm font-medium transition-colors sm:w-auto"
              >
                <span className="material-symbols-outlined text-[18px] leading-none">apps</span>
                Sector demos
              </Link>
            </div>

            <dl className="border-outline-variant bg-surface-container-low/50 mx-auto mt-14 grid max-w-2xl grid-cols-3 gap-px overflow-hidden rounded-2xl border sm:mt-16">
              {STATS.map((s) => (
                <div
                  key={s.label}
                  className="bg-background/60 px-3 py-4 text-center backdrop-blur-[2px] sm:px-5 sm:py-5"
                >
                  <dt className="sr-only">{s.label}</dt>
                  <dd className="font-[family-name:var(--font-space-grotesk)] text-on-surface text-2xl font-semibold tabular-nums sm:text-3xl">
                    {s.value}
                  </dd>
                  <div className="text-on-surface-variant mt-1 text-[10px] uppercase tracking-wide sm:text-xs">{s.label}</div>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Code preview */}
        <section className="mx-auto max-w-4xl px-5 pb-20 sm:px-6 sm:pb-28">
          <div className="mb-8 text-center sm:mb-10">
            <h2 className="font-[family-name:var(--font-space-grotesk)] text-on-surface text-2xl font-semibold tracking-tight sm:text-3xl">
              Same pipeline. Your protocol.
            </h2>
            <p className="text-on-surface-variant mx-auto mt-2 max-w-lg text-sm sm:text-base">
              Pick how your stack talks to NetIQ — the decision engine never changes.
            </p>
          </div>
          <div className="border-outline-variant shadow-[0_24px_80px_-24px_rgba(0,0,0,0.45)] overflow-hidden rounded-2xl border">
            <div className="border-outline-variant bg-surface-container-low flex flex-wrap items-center gap-1 border-b p-2 sm:gap-0 sm:p-0">
              {(
                [
                  { id: "rest" as const, label: "REST", icon: "api" },
                  { id: "mcp" as const, label: "MCP", icon: "hub" },
                  { id: "a2a" as const, label: "A2A", icon: "swap_horiz" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 font-mono text-xs font-medium transition-all sm:flex-none sm:rounded-none sm:px-5 sm:py-3 ${
                    tab === t.id
                      ? "bg-background text-on-surface shadow-sm sm:shadow-none"
                      : "text-on-surface-variant hover:text-on-surface sm:border-r sm:border-outline-variant"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] opacity-80">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
            <pre className="bg-surface-container-low text-on-surface max-h-[min(420px,55vh)] overflow-x-auto overflow-y-auto p-5 font-mono text-[11px] leading-relaxed sm:p-6 sm:text-xs">
              {tab === "rest" ? REST_SNIPPET : tab === "mcp" ? MCP_SNIPPET : A2A_SNIPPET}
            </pre>
          </div>
        </section>

        {/* Features */}
        <section className="border-outline-variant border-t">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-[family-name:var(--font-space-grotesk)] text-on-surface text-2xl font-semibold tracking-tight sm:text-3xl">
                Built for the agent economy
              </h2>
              <p className="text-on-surface-variant mt-3 text-base leading-relaxed">
                MCP and A2A are becoming how AI agents discover and call capabilities. NetIQ meets them where they
                already integrate — with CAMARA under the hood.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              <Feature
                icon="hub"
                title="MCP server"
                body="Drop NetIQ into Claude Desktop, Cursor, or any MCP-aware agent. Stdio and HTTP transports supported."
              />
              <Feature
                icon="dns"
                title="A2A endpoint"
                body="Agent Card discovery plus tasks/send and streaming — other agents invoke NetIQ as a peer."
              />
              <Feature
                icon="network_intelligence"
                title="Dual-mode engine"
                body="LLM picks among many CAMARA signals, or lock in JSON policy mode. Same memory and audit trail."
                className="sm:col-span-2 lg:col-span-1"
              />
            </div>
          </div>
        </section>

        {/* Compare */}
        <section className="border-outline-variant border-t">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-[family-name:var(--font-space-grotesk)] text-on-surface text-2xl font-semibold tracking-tight sm:text-3xl">
                Decisions, not a dozen endpoints
              </h2>
              <p className="text-on-surface-variant mt-3 text-base leading-relaxed">
                Stop hand-orchestrating SIM swap, device history, and QoS in every agent. Say what you’re trying to
                protect — NetIQ returns a structured verdict.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              <CompareCard
                label="Without NetIQ"
                tone="muted"
                code={`// agent must orchestrate every step
const sim    = await simSwap(phone)
const dev    = await deviceSwap(phone)
const kyc    = await kycMatch(phone)
const loc    = await location(phone)
const qos    = await qosStatus(phone)

// ...then fuse, weight, and decide on its own`}
              />
              <CompareCard
                label="With NetIQ"
                tone="primary"
                code={`// one call, full pipeline
const result = await decide({
  intent: "fraud_prevention",
  phone:  "+233241234567",
  mode:   "agent"
})

// → { decision: "ALLOW", confidence: 0.94, ... }`}
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-5 pb-20 sm:px-6 sm:pb-28">
          <div className="border-outline-variant bg-surface-container-low/80 relative mx-auto max-w-4xl overflow-hidden rounded-3xl border px-6 py-14 text-center sm:px-10 sm:py-16">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              aria-hidden
              style={{
                background:
                  "radial-gradient(ellipse 80% 60% at 50% 100%, var(--color-primary) 0%, transparent 55%)",
              }}
            />
            <div className="relative">
              <h2 className="font-[family-name:var(--font-space-grotesk)] text-on-surface text-2xl font-semibold tracking-tight sm:text-3xl">
                Open the console in one click
              </h2>
              <p className="text-on-surface-variant mx-auto mt-3 max-w-md text-sm sm:text-base">
                Shared demo workspace — explore API keys, policies, simulator, and docs with no separate signup.
              </p>
              <Link
                href="/login"
                className="bg-primary text-on-primary hover:opacity-92 mt-8 inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold shadow-md transition-opacity"
              >
                Continue as demo user
                <span className="material-symbols-outlined text-[18px] leading-none">arrow_forward</span>
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-outline-variant border-t">
          <div className="text-on-surface-variant mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 py-10 text-xs sm:flex-row sm:px-6">
            <span className="font-[family-name:var(--font-space-grotesk)] text-on-surface text-sm font-medium">
              © {new Date().getFullYear()} NetIQ
            </span>
            <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <Link href="/ask" className="hover:text-on-surface transition-colors">
                Ask
              </Link>
              <Link href="/demo" className="hover:text-on-surface transition-colors">
                Demos
              </Link>
              <Link href="/login" className="hover:text-on-surface transition-colors">
                Console
              </Link>
              <Link href="/console/docs" className="hover:text-on-surface transition-colors">
                API docs
              </Link>
            </nav>
          </div>
        </footer>
      </main>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
  className = "",
}: {
  icon: string;
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div
      className={`border-outline-variant bg-surface-container-low/40 hover:border-outline group rounded-2xl border p-6 transition-colors hover:bg-surface-container-low/70 ${className}`}
    >
      <span className="text-primary material-symbols-outlined mb-4 block text-[28px] leading-none transition-transform group-hover:scale-105">
        {icon}
      </span>
      <h3 className="text-on-surface text-lg font-semibold">{title}</h3>
      <p className="text-on-surface-variant mt-2 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function CompareCard({
  label,
  tone,
  code,
}: {
  label: string;
  tone: "muted" | "primary";
  code: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border transition-shadow ${
        tone === "primary"
          ? "border-primary/35 shadow-[0_0_0_1px_var(--color-primary-container)] shadow-lg"
          : "border-outline-variant"
      }`}
    >
      <div
        className={`flex items-center justify-between border-b px-4 py-3 ${
          tone === "primary" ? "border-primary/25 bg-primary/5" : "border-outline-variant bg-surface-container-low"
        }`}
      >
        <span className="text-on-surface-variant font-mono text-[10px] uppercase tracking-[0.15em] sm:text-xs">
          {label}
        </span>
        {tone === "primary" ? (
          <span className="material-symbols-outlined text-success text-[18px]" aria-hidden>
            check_circle
          </span>
        ) : (
          <span className="material-symbols-outlined text-on-surface-variant/60 text-[18px]" aria-hidden>
            more_horiz
          </span>
        )}
      </div>
      <pre className="bg-surface-container-low text-on-surface max-h-[280px] overflow-x-auto overflow-y-auto p-4 font-mono text-[11px] leading-relaxed sm:p-5 sm:text-xs">
        {code}
      </pre>
    </div>
  );
}
