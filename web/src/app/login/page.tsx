"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { demoUsers } from "@/lib/seed";
import { roleLabel } from "@/lib/format";
import { Button, Field, inputClass } from "@/components/ui";

export default function LoginPage() {
  const { loginAs, loginWithPassword, mode } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("admin@insurax.africa");
  const [password, setPassword] = useState("InsuraXDemo2026!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="min-h-screen atmosphere px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <p className="brand-mark text-4xl tracking-[0.08em] text-heading">InsuraX</p>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-teal">
          Insurance OS · {mode}
        </p>
        <h1 className="mt-4 font-display text-4xl text-heading md:text-5xl">
          {mode === "supabase" ? "Sign in to InsuraX" : "Enter as a persona"}
        </h1>
        <p className="mt-3 max-w-2xl text-mute">
          {mode === "supabase"
            ? "Connected to Supabase Auth. Use a seeded demo account, or fall back to local personas while wiring roles."
            : "No password required. Each role opens the same platform with different permissions."}
        </p>

        {mode === "supabase" ? (
          <form
            className="panel-glass mt-8 max-w-md space-y-4 rounded-2xl p-6 shadow-soft"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await loginWithPassword(email, password);
                router.push("/app/dashboard");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Sign-in failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Email">
              <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit">{busy ? "Signing in…" : "Sign in"}</Button>
            <p className="text-xs text-mute">Seeded: admin@insurax.africa / InsuraXDemo2026!</p>
          </form>
        ) : null}

        <div className="mt-10">
          <p className="mb-4 text-sm font-medium text-heading">
            {mode === "supabase" ? "Or continue with a local persona" : "Choose a persona"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {demoUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => {
                  loginAs(user.id);
                  router.push("/app/dashboard");
                }}
                className="rounded-2xl border border-line bg-surface/80 p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-teal hover:shadow-lift"
              >
                <p className="text-[11px] uppercase tracking-[0.16em] text-teal">{roleLabel(user.role)}</p>
                <p className="mt-2 font-medium text-heading">{user.name}</p>
                <p className="text-xs text-mute">{user.branch}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
