"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { demoUsers } from "./seed";
import type { SessionUser, UserRole } from "./types";

/**
 * The Supabase client is loaded on demand, so pages that never need it
 * (the landing page in demo mode) don't ship or parse it up front.
 */
async function supabaseClient() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient();
}

const KEY = "insurax.session";

type AuthContextValue = {
  user: SessionUser | null;
  ready: boolean;
  mode: "demo" | "supabase";
  operatorId: string | null;
  login: (role: UserRole) => void;
  loginAs: (userId: string) => void;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type ProfileRow = {
  operator_id: string | null;
  branch_id: string | null;
  role: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

async function profileToSession(userId: string): Promise<{ user: SessionUser; operatorId: string | null }> {
  const supabase = await supabaseClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const p = profile as ProfileRow | null;
  const { data: participant } = await supabase.from("participants").select("id").eq("profile_id", userId).maybeSingle();
  const { data: agent } = await supabase.from("agents").select("id").eq("profile_id", userId).maybeSingle();
  const { data: broker } = await supabase.from("brokers").select("id").eq("profile_id", userId).maybeSingle();
  const { data: branch } = p?.branch_id
    ? await supabase.from("branches").select("name").eq("id", p.branch_id).maybeSingle()
    : { data: null };

  return {
    operatorId: p?.operator_id ?? null,
    user: {
      id: userId,
      name: p?.full_name ?? p?.email ?? "User",
      email: p?.email ?? "",
      phone: p?.phone ?? "",
      role: (p?.role as UserRole) ?? "participant",
      branch: (branch as { name?: string } | null)?.name ?? "Head office",
      participantId: (participant as { id?: string } | null)?.id,
      agentId: (agent as { id?: string } | null)?.id,
      brokerId: (broker as { id?: string } | null)?.id,
    },
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const mode = isSupabaseConfigured() ? ("supabase" as const) : ("demo" as const);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [operatorId, setOperatorId] = useState<string | null>(
    process.env.NEXT_PUBLIC_OPERATOR_ID ?? null,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      if (mode === "demo") {
        try {
          const raw = localStorage.getItem(KEY);
          if (raw && !cancelled) setUser(JSON.parse(raw) as SessionUser);
        } catch {
          localStorage.removeItem(KEY);
        }
        if (!cancelled) setReady(true);
        return;
      }

      const supabase = await supabaseClient();
      const { data } = await supabase.auth.getSession();
      if (data.session?.user && !cancelled) {
        const mapped = await profileToSession(data.session.user.id);
        if (!cancelled) {
          setUser(mapped.user);
          setOperatorId(mapped.operatorId ?? process.env.NEXT_PUBLIC_OPERATOR_ID ?? null);
        }
      }

      const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!session?.user) {
          setUser(null);
          return;
        }
        const mapped = await profileToSession(session.user.id);
        setUser(mapped.user);
        setOperatorId(mapped.operatorId ?? process.env.NEXT_PUBLIC_OPERATOR_ID ?? null);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [mode]);

  const login = useCallback((role: UserRole) => {
    const next = demoUsers.find((u) => u.role === role) ?? demoUsers[0];
    localStorage.setItem(KEY, JSON.stringify(next));
    setUser(next);
  }, []);

  const loginAs = useCallback((userId: string) => {
    const next = demoUsers.find((u) => u.id === userId) ?? demoUsers[0];
    localStorage.setItem(KEY, JSON.stringify(next));
    setUser(next);
  }, []);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const supabase = await supabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error("No user returned");
    const mapped = await profileToSession(data.user.id);
    setUser(mapped.user);
    setOperatorId(mapped.operatorId ?? process.env.NEXT_PUBLIC_OPERATOR_ID ?? null);
  }, []);

  const logout = useCallback(async () => {
    if (mode === "supabase") {
      const supabase = await supabaseClient();
      await supabase.auth.signOut();
    }
    localStorage.removeItem(KEY);
    setUser(null);
  }, [mode]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, ready, mode, operatorId, login, loginAs, loginWithPassword, logout }),
    [user, ready, mode, operatorId, login, loginAs, loginWithPassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
