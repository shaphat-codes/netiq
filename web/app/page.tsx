"use client";

import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

type Tab = "rest" | "mcp" | "a2a";

const REST_SNIPPET = `curl -X POST https://api.netiq.dev/decision/run \\
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
curl https://api.netiq.dev/.well-known/agent.json

# 2. Send a task as one agent to another
curl -X POST https://api.netiq.dev/a2a/tasks/send \\
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

export default function Home() {
  const [tab, setTab] = useState<Tab>("rest");

  return (
    <div className="bg-background text-on-background min-h-screen">
      <nav className="bg-background border-outline-variant fixed top-0 z-50 h-14 w-full border-b">
        <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-6">
          <Link href="/" className="text-on-surface text-base font-semibold tracking-tight">
            NetIQ
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/demo"
              className="text-on-surface-variant hover:text-on-surface hidden items-center gap-1.5 text-sm transition-colors sm:inline-flex"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">apps</span>
              Demos
            </Link>
            <ThemeToggle />
            <Link
              href="/login"
              className="bg-primary text-on-primary hover:opacity-90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity"
            >
              Sign in
              <span className="material-symbols-outlined text-[14px] leading-none">arrow_forward</span>
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-14">
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-6 py-32 text-center">
          <p className="text-on-surface-variant text-xs uppercase tracking-widest">
            Agent-ready layer for Nokia Network as Code
          </p>
          <h1 className="text-on-surface mt-4 text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
            Network intelligence,
            <br />
            shaped for AI agents.
          </h1>
          <p className="text-on-surface-variant mx-auto mt-6 max-w-xl text-lg leading-relaxed">
            NetIQ turns Nokia Network as Code CAMARA APIs into ready-to-call business
            decisions. One <code className="font-mono text-base">decide</code> call —
            from REST, MCP, or A2A — and you get back ALLOW / VERIFY / BLOCK with
            confidence, trace, and cross-sector memory.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="bg-primary text-on-primary hover:opacity-90 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-opacity"
            >
              Sign in to console
              <span className="material-symbols-outlined text-[16px] leading-none">arrow_forward</span>
            </Link>
            <Link
              href="/ask"
              className="border-outline-variant text-on-surface hover:bg-surface-container-low inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">chat_bubble</span>
              Try it free
            </Link>
            <Link
              href="/demo"
              className="border-outline-variant text-on-surface hover:bg-surface-container-low inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">apps</span>
              Explore sector demos
            </Link>
          </div>
          <p className="text-on-surface-variant mt-3 text-xs">
            No signup needed — type a phone number and a scenario at{" "}
            <Link href="/ask" className="hover:text-on-surface underline-offset-2 hover:underline">
              /ask
            </Link>
            .
          </p>
        </section>

        {/* Code preview with tabs */}
        <section className="mx-auto max-w-3xl px-6 pb-24">
          <div className="border-outline-variant overflow-hidden rounded-lg border">
            <div className="border-outline-variant bg-surface-container-low flex items-center border-b">
              {(
                [
                  { id: "rest", label: "REST" },
                  { id: "mcp", label: "MCP server" },
                  { id: "a2a", label: "A2A protocol" },
                ] as { id: Tab; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`border-r border-outline-variant px-4 py-2 font-mono text-xs transition-colors ${
                    tab === t.id
                      ? "text-on-surface bg-background"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <pre className="bg-surface-container-low text-on-surface overflow-x-auto p-5 font-mono text-xs leading-relaxed">
              {tab === "rest" ? REST_SNIPPET : tab === "mcp" ? MCP_SNIPPET : A2A_SNIPPET}
            </pre>
          </div>
          <p className="text-on-surface-variant mt-3 text-center text-xs">
            Same decision pipeline. Three protocols. Pick the one your agent already
            speaks.
          </p>
        </section>

        {/* Three-up features */}
        <section className="border-outline-variant border-t">
          <div className="mx-auto max-w-5xl px-6 py-24">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-on-surface text-3xl font-semibold tracking-tight">
                Built for the agent economy.
              </h2>
              <p className="text-on-surface-variant mt-3 text-base">
                Telefónica and Nokia are piloting MCP + A2A as the standard for
                exposing network APIs to AI agents. NetIQ is built around the
                same vision, applied to Sub-Saharan Africa.
              </p>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-12 md:grid-cols-3">
              <Feature
                icon="hub"
                title="MCP server"
                body="Drop NetIQ into Claude Desktop, Cursor, or any MCP-aware agent. Stdio + HTTP transports out of the box."
              />
              <Feature
                icon="dns"
                title="A2A endpoint"
                body="Standards-compliant Agent Card and tasks/send + tasks/sendSubscribe. Other agents discover and invoke NetIQ."
              />
              <Feature
                icon="network_intelligence"
                title="Dual-mode engine"
                body="LLM agent dynamically picks among 16 CAMARA signals — or run your own JSON policy. Same memory, same trace."
              />
            </div>
          </div>
        </section>

        {/* Granularity comparison */}
        <section className="border-outline-variant border-t">
          <div className="mx-auto max-w-5xl px-6 py-24">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-on-surface text-3xl font-semibold tracking-tight">
                Decisions, not endpoints.
              </h2>
              <p className="text-on-surface-variant mt-3 text-base">
                Raw CAMARA APIs leave the orchestration to the agent. NetIQ lifts
                the abstraction one level — express intent, receive a decision.
              </p>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
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
        <section className="border-outline-variant border-t">
          <div className="mx-auto max-w-3xl px-6 py-24 text-center">
            <h2 className="text-on-surface text-3xl font-semibold tracking-tight">
              Start building in minutes.
            </h2>
            <p className="text-on-surface-variant mt-3 text-base">
              Free to try. No credit card required.
            </p>
            <Link
              href="/login"
              className="bg-primary text-on-primary hover:opacity-90 mt-8 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-opacity"
            >
              Sign in to console
              <span className="material-symbols-outlined text-[16px] leading-none">arrow_forward</span>
            </Link>
          </div>
        </section>

        <footer className="border-outline-variant border-t">
          <div className="text-on-surface-variant mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs sm:flex-row">
            <span>© {new Date().getFullYear()} NetIQ.</span>
            <div className="flex gap-6">
              <Link href="/login" className="hover:text-on-surface transition-colors">
                Sign in
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="space-y-3">
      <span className="text-on-surface-variant material-symbols-outlined text-[20px] leading-none">{icon}</span>
      <h3 className="text-on-surface text-base font-medium">{title}</h3>
      <p className="text-on-surface-variant text-sm leading-relaxed">{body}</p>
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
      className={`overflow-hidden rounded-lg border ${
        tone === "primary" ? "border-primary/40" : "border-outline-variant"
      }`}
    >
      <div className="border-outline-variant bg-surface-container-low flex items-center justify-between border-b px-4 py-2">
        <span className="text-on-surface-variant font-mono text-xs uppercase tracking-wide">
          {label}
        </span>
      </div>
      <pre className="bg-surface-container-low text-on-surface overflow-x-auto p-4 font-mono text-xs leading-relaxed">
        {code}
      </pre>
    </div>
  );
}
