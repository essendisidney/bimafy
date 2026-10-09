"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { demoUsers } from "@/lib/seed";
import { roleLabel } from "@/lib/format";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button, Field, inputClass } from "@/components/ui";

export default function LoginPage() {
  const { loginAs, loginWithPassword, mode } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="min-h-screen atmosphere px-4 py-12">
      <main className="mx-auto max-w-4xl">
        <Link href="/" aria-label="Bimafy home">
          <Logo className="text-4xl" markClassName="h-11 w-11" />
        </Link>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-teal-ink">Karibu tena · Welcome back</p>
        <h1 className="mt-4 font-display text-4xl text-heading md:text-5xl">
          {mode === "supabase" ? "Sign in to Bimafy" : "Enter as a persona"}
        </h1>
        <p className="mt-3 max-w-2xl text-mute">
          {mode === "supabase"
            ? "Agents, brokers and staff: sign in with your work email. Just looking around? Try a demo role below — no password needed."
            : "No password needed. Each role opens the same app with what that person would see."}
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
          </form>
        ) : null}

        <div className="mt-10">
          <p className="mb-4 text-sm font-medium text-heading">
            {mode === "supabase" ? "Or explore with a demo role" : "Choose a persona"}
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
      </main>
    </div>
  );
}
