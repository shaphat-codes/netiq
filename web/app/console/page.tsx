"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { DecisionBadge } from "@/components/console/DecisionBadge";
import { apiFetch } from "@/lib/api";

type Metrics = {
  total_requests?: number;
  error_count?: number;
  blocked_count?: number;
};

type EventRow = {
  id: number;
  decision: string;
  intent: string;
  risk_score: number;
  duration_ms?: number;
  created_at: string;
  phone?: string;
};

function fmtKpi(n: number | undefined): string {
  if (n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return n.toLocaleString();
  return String(n);
}

function maskPhone(p?: string) {
  if (!p || p.length < 5) return p || "—";
  return `${p.slice(0, -4).replace(/./g, "•")}${p.slice(-4)}`;
}

function riskBarColor(score: number | undefined) {
  const v = typeof score === "number" ? score : 0;
  if (v >= 70) return "bg-error";
  if (v >= 30) return "bg-warning";
  return "bg-success";
}

function riskTextColor(score: number | undefined) {
  const v = typeof score === "number" ? score : 0;
  if (v >= 70) return "text-error";
  if (v >= 30) return "text-warning";
  return "text-on-surface-variant";
}

export default function ConsoleHome() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    (async () => {
      const m = await apiFetch<Metrics>("/api/v1/metrics/summary?days=30");
      if (m.ok) setMetrics(m.data);
      const e = await apiFetch<{ events: EventRow[] }>("/api/v1/events?limit=8");
      if (e.ok && e.data && "events" in e.data) setEvents(e.data.events);
    })();
  }, []);

  const riskBarWidth = useMemo(
    () => (score: number) => `${Math.min(100, Math.max(0, Math.round(score)))}%`,
    []
  );

  const total = metrics?.total_requests;
  const errors = metrics?.error_count;
  const blocked = metrics?.blocked_count;

  return (
    <ConsolePage title="Overview">
      <div className="space-y-12">
        <header className="space-y-1">
          <h1 className="text-on-surface text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-on-surface-variant text-sm">
            A snapshot of your decision traffic over the last 30 days.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-x-12 gap-y-8 sm:grid-cols-3">
          <Stat label="Requests" value={fmtKpi(total)} />
          <Stat label="Errors" value={fmtKpi(errors)} />
          <Stat label="Blocked" value={fmtKpi(blocked)} />
        </section>

        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-on-surface text-base font-medium">Recent activity</h2>
            <Link
              href="/console/events"
              className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 text-sm transition-colors"
            >
              View all
              <span className="material-symbols-outlined text-[16px] leading-none">chevron_right</span>
            </Link>
          </div>
          <div className="border-outline-variant overflow-hidden rounded-md border">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-outline-variant border-b">
                  <th className="text-on-surface-variant px-4 py-2.5 text-xs font-medium">Time</th>
                  <th className="text-on-surface-variant px-4 py-2.5 text-xs font-medium">Intent</th>
                  <th className="text-on-surface-variant px-4 py-2.5 text-xs font-medium">Decision</th>
                  <th className="text-on-surface-variant px-4 py-2.5 text-xs font-medium">Risk</th>
                  <th className="text-on-surface-variant px-4 py-2.5 text-right text-xs font-medium">Subject</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-on-surface-variant px-4 py-8 text-sm">
                      No events yet. Use the simulator or call <code className="font-mono">POST /decision/run</code>.
                    </td>
                  </tr>
                ) : (
                  events.map((ev) => (
                    <tr
                      key={ev.id}
                      className="border-outline-variant hover:bg-surface-container-low border-t transition-colors"
                    >
                      <td className="text-on-surface-variant px-4 py-2.5 font-mono text-xs">
                        {ev.created_at?.replace("T", " ").slice(0, 16) ?? "—"}
                      </td>
                      <td className="text-on-surface px-4 py-2.5">{ev.intent || "—"}</td>
                      <td className="px-4 py-2.5">
                        <DecisionBadge d={ev.decision} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="bg-surface-container-high h-1 w-16 overflow-hidden rounded-full">
                            <div
                              className={`h-full ${riskBarColor(ev.risk_score)}`}
                              style={{ width: riskBarWidth(ev.risk_score) }}
                            />
                          </div>
                          <span className={`font-mono text-xs tabular-nums ${riskTextColor(ev.risk_score)}`}>
                            {typeof ev.risk_score === "number" ? Math.round(ev.risk_score) : "—"}
                          </span>
                        </div>
                      </td>
                      <td className="text-on-surface-variant px-4 py-2.5 text-right font-mono text-xs">
                        {maskPhone(ev.phone)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </ConsolePage>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-on-surface-variant text-xs">{label}</div>
      <div className="text-on-surface text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
    </div>
  );
}
