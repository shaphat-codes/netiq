"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { fetchSession, signIn, signOut } from "@/lib/demo/client";
import type {
  ContextPayload,
  DemoSession,
  NetiqDecision,
} from "@/lib/demo/types";

type SignInResult =
  | { ok: true; decision: NetiqDecision }
  | { ok: false; errors: string[]; decision?: NetiqDecision };

type Ctx = {
  session: DemoSession | null;
  loading: boolean;
  signIn: (input: {
    phone: string;
    intent?: string;
    context?: ContextPayload;
  }) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const DemoSessionCtx = createContext<Ctx | null>(null);

export function DemoSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetchSession();
      setSession(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const doSignIn = useCallback<Ctx["signIn"]>(async (input) => {
    const res = await signIn(input);
    if (res.ok) {
      setSession(res.session);
      return { ok: true, decision: res.decision };
    }
    // Sign-in returns the decision body even on BLOCK so we can show why.
    const decision = (res as unknown as { decision?: NetiqDecision }).decision;
    return { ok: false, errors: res.errors, decision };
  }, []);

  const doSignOut = useCallback<Ctx["signOut"]>(async () => {
    await signOut();
    setSession(null);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      session,
      loading,
      signIn: doSignIn,
      signOut: doSignOut,
      refresh,
    }),
    [session, loading, doSignIn, doSignOut, refresh]
  );

  return (
    <DemoSessionCtx.Provider value={value}>{children}</DemoSessionCtx.Provider>
  );
}

export function useDemoSession() {
  const ctx = useContext(DemoSessionCtx);
  if (!ctx) {
    throw new Error("useDemoSession must be used inside <DemoSessionProvider>");
  }
  return ctx;
}
