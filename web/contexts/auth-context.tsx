"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { apiFetch, fetchMe } from "@/lib/api";

export type Me = {
  user_id: number;
  email: string;
  account_id: number;
  account_name: string;
};

type AuthCtx = {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const { ok, data } = await fetchMe();
    if (ok && data && "user_id" in data) {
      setMe(data);
    } else {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const logout = useCallback(async () => {
    await apiFetch("/api/v1/auth/logout", { method: "POST", body: "{}" });
    setMe(null);
    router.push("/login");
  }, [router]);

  return (
    <Ctx.Provider value={{ me, loading, refresh, logout }}>{children}</Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
