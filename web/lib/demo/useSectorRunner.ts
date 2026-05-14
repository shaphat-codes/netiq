"use client";

import { useCallback, useEffect, useState } from "react";

import { useDemoSession } from "@/components/demo/DemoSessionProvider";
import { runAction } from "./client";
import type { ContextPayload, NetiqDecision } from "./types";

export type ActionPhase = "idle" | "running" | "result";

export type ActionRunState = {
  phase: ActionPhase;
  decision: NetiqDecision | null;
  error: string | null;
};

const INITIAL: ActionRunState = {
  phase: "idle",
  decision: null,
  error: null,
};

/**
 * Per-sector multi-action runner.
 *
 * Each in-app action gets its own slot so opening "high-value send" after
 * having run "quick send" starts cleanly while the previous result remains
 * available if the UI wants to show it elsewhere.
 *
 * `resetSignal` lets the parent reset state when, for example, a sheet
 * closes and reopens for the same action.
 */
export function useSectorRunner() {
  const { session } = useDemoSession();
  const phone = session?.phone;

  const [state, setState] = useState<Record<string, ActionRunState>>({});

  const get = useCallback(
    (key: string): ActionRunState => state[key] ?? INITIAL,
    [state]
  );

  const reset = useCallback((key: string) => {
    setState((prev) => ({ ...prev, [key]: INITIAL }));
  }, []);

  const run = useCallback(
    async (
      key: string,
      input: { intent: string; context?: ContextPayload; mode?: "agent" | "policy" }
    ) => {
      setState((prev) => ({
        ...prev,
        [key]: { phase: "running", decision: null, error: null },
      }));
      const res = await runAction({
        ...input,
        phone: phone ?? undefined,
      });
      setState((prev) => ({
        ...prev,
        [key]: res.ok
          ? { phase: "result", decision: res.decision, error: null }
          : {
              phase: "result",
              decision: null,
              error: res.errors[0] || "NetIQ couldn't complete this action.",
            },
      }));
      return res;
    },
    [phone],
  );

  return { get, run, reset };
}

/**
 * Helper to map a NetiqDecision into one of three buckets the UI cares about.
 */
export function bucketize(d: NetiqDecision | null): "ok" | "verify" | "block" | null {
  if (!d) return null;
  if (d.decision === "ALLOW") return "ok";
  if (d.decision === "BLOCK") return "block";
  return "verify";
}

/**
 * Convenience: reset a single action key when an open prop transitions
 * from null → non-null. Used by sheets / modals.
 */
export function useResetOnOpen(
  key: string | null,
  reset: (k: string) => void
) {
  useEffect(() => {
    if (key) reset(key);
  }, [key, reset]);
}
