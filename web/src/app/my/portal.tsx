"use client";

import Link from "next/link";
import { FileDown, LogOut, MessageCircle, ShieldCheck, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PublicHeader } from "@/components/public/public-header";
import { Badge, cn, inputClass } from "@/components/ui";
import { buildPolicyCertificateHtml, downloadTextFile } from "@/lib/documents/certificate";
import { whatsappLink } from "@/lib/engines/agency";
import { money } from "@/lib/format";
import { portalPolicyToPolicy, type PortalData, type PortalPolicy } from "@/lib/portal";

const KEY = "bimafy.portal";
const read = () => {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const write = (v: string | null) => {
  try {
    if (v) window.localStorage.setItem(KEY, v);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private mode: the session lasts until the tab closes.
  }
};

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(json.error ?? "Something went wrong"), { status: res.status });
  return json;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

export function CustomerPortal() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<PortalData | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async (t: string) => {
    try {
      setData(await call<PortalData>("/api/portal/me", { token: t }));
      setToken(t);
    } catch (err) {
      if ((err as { status?: number }).status === 401) {
        write(null);
        setToken(null);
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const saved = read();
    // Restoring a saved session is an external read, so it starts from an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) void load(saved);
    else setReady(true);
  }, [load]);

  async function signOut() {
    if (token) await call("/api/portal/logout", { method: "POST", token }).catch(() => null);
    write(null);
    setToken(null);
    setData(null);
  }

  return (
    <div className="min-h-dvh bg-paper">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 pb-16">
        {!ready ? (
          <div className="mt-6 h-48 animate-pulse rounded-3xl bg-sand" aria-busy />
        ) : token && data ? (
          <Dashboard data={data} token={token} reload={() => load(token)} onSignOut={signOut} />
        ) : (
          <SignIn
            onSignedIn={(t) => {
              write(t);
              void load(t);
            }}
          />
        )}
      </main>
    </div>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ demo?: boolean }>("/api/portal/start", { method: "POST", body: JSON.stringify({ phone }) });
      setDemo(Boolean(r.demo));
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ token: string }>("/api/portal/verify", { method: "POST", body: JSON.stringify({ phone, code }) });
      onSignedIn(r.token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-4 max-w-md rounded-[1.75rem] border border-line bg-surface p-5 shadow-lift sm:p-7">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal">My cover</p>
      <h1 className="mt-1 font-display text-3xl text-heading">Sign in with your phone</h1>
      <p className="mt-1 text-sm text-mute">See your policies, pay by M-Pesa, get your certificate and report a claim. No password needed.</p>
      {step === "phone" ? (
        <form onSubmit={sendCode} className="mt-5 space-y-3" noValidate>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">The number on your policy</span>
            <input className={inputClass} type="tel" inputMode="tel" autoComplete="tel" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          {error ? <Alert>{error}</Alert> : null}
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-teal px-5 py-3.5 text-base font-semibold text-on-accent hover:bg-mint disabled:opacity-60">
            {busy ? "Sending…" : "Send me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-5 space-y-3" noValidate>
          <p className="rounded-xl bg-sand px-3 py-2 text-sm">
            {demo
              ? "Demo mode: enter 123456."
              : "If this number has a Bimafy policy, we've texted it a 6-digit code. It works for 10 minutes."}
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Code from the SMS</span>
            <input
              className={cn(inputClass, "text-center font-mono text-2xl tracking-[0.5em]")}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
          </label>
          {error ? <Alert>{error}</Alert> : null}
          <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-xl bg-teal px-5 py-3.5 text-base font-semibold text-on-accent hover:bg-mint disabled:opacity-60">
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button type="button" onClick={() => { setStep("phone"); setCode(""); setError(null); }} className="w-full py-1 text-sm text-mute hover:text-ink">
            Use a different number
          </button>
        </form>
      )}
    </div>
  );
}

function Dashboard({ data, token, reload, onSignOut }: { data: PortalData; token: string; reload: () => void; onSignOut: () => void }) {
  const [claimFor, setClaimFor] = useState<PortalPolicy | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function pay(p: PortalPolicy) {
    try {
      const r = await call<{ url: string }>("/api/portal/pay", { method: "POST", token, body: JSON.stringify({ policyId: p.id }) });
      window.location.assign(r.url);
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    }
  }

  function certificate(p: PortalPolicy) {
    const policy = portalPolicyToPolicy(p);
    downloadTextFile(`${p.number.replaceAll("/", "-")}_Certificate.html`, buildPolicyCertificateHtml(policy), "text/html");
  }

  return (
    <div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal">My cover</p>
          <h1 className="mt-1 font-display text-4xl text-heading">Habari {data.first_name}</h1>
        </div>
        <button onClick={onSignOut} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </div>
      {notice ? (
        <div className="mt-4">
          {notice.ok ? (
            <p role="status" className="rounded-xl border border-teal/25 bg-teal/10 px-3 py-2 text-sm text-teal-ink">
              {notice.text}
            </p>
          ) : (
            <Alert>{notice.text}</Alert>
          )}
        </div>
      ) : null}

      <h2 className="mt-6 font-display text-2xl">Your policies</h2>
      {data.policies.length === 0 ? (
        <p className="mt-2 text-sm text-mute">No policies on this number yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {data.policies.map((p) => (
            <li key={p.id} className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-display text-xl text-heading">{p.product_name}</p>
                  <p className="text-xs text-mute">{p.number}</p>
                </div>
                <Badge status={p.status} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <Item k="Cover" v={money(Number(p.sum_covered))} />
                <Item k="Premium" v={`${money(Number(p.contribution))} / ${p.frequency}`} />
                <Item k="Ends" v={day(p.expiry)} />
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                {p.can_pay ? (
                  <button onClick={() => pay(p)} className="inline-flex items-center gap-1.5 rounded-xl bg-teal px-3 py-2 text-sm font-semibold text-on-accent hover:bg-mint">
                    <Wallet className="size-4" aria-hidden />
                    Pay {money(Number(p.contribution))} by M-Pesa
                  </button>
                ) : null}
                <button onClick={() => certificate(p)} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm hover:border-teal">
                  <FileDown className="size-4" aria-hidden />
                  Certificate
                </button>
                {p.status === "active" || p.status === "reinstated" ? (
                  <button onClick={() => setClaimFor(p)} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm hover:border-teal">
                    <ShieldCheck className="size-4" aria-hidden />
                    Report a claim
                  </button>
                ) : null}
                {p.agent?.phone ? (
                  <a
                    href={whatsappLink(p.agent.phone, `Hi ${p.agent.name.split(" ")[0]}, it's ${data.full_name} about policy ${p.number}.`)}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm hover:border-teal"
                  >
                    <MessageCircle className="size-4" aria-hidden />
                    WhatsApp {p.agent.name.split(" ")[0]}
                  </a>
                ) : null}
              </div>
              {claimFor?.id === p.id ? (
                <ClaimForm
                  policy={p}
                  token={token}
                  onDone={(msg) => {
                    setClaimFor(null);
                    setNotice({ ok: true, text: msg });
                    reload();
                  }}
                  onCancel={() => setClaimFor(null)}
                />
              ) : null}
              {p.agent?.slug ? (
                <p className="mt-3 text-xs text-mute">
                  Your agent: <Link href={`/agents/${p.agent.slug}`} className="underline hover:text-ink">{p.agent.name}</Link>
                </p>
              ) : p.agent ? (
                <p className="mt-3 text-xs text-mute">Your agent: {p.agent.name}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {data.claims.length ? (
        <>
          <h2 className="mt-8 font-display text-2xl">Your claims</h2>
          <ul className="mt-3 space-y-2">
            {data.claims.map((c) => (
              <li key={c.number} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{c.number}</span>
                  <span className="text-mute"> · {c.policy_number} · {day(c.reported_at)}</span>
                  {c.claimed ? <span className="text-mute"> · {money(Number(c.claimed))}</span> : null}
                </span>
                <Badge status={c.status} />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {data.payments.length ? (
        <>
          <h2 className="mt-8 font-display text-2xl">Payments</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
            {data.payments.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>
                  <span className="font-medium">{money(Number(p.amount))}</span>
                  <span className="text-mute"> · {p.policy_number}{p.paid_at ? ` · ${day(p.paid_at)}` : ""}</span>
                </span>
                <span className="text-xs text-mute">{p.receipt ? `Receipt ${p.receipt}` : p.status}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function ClaimForm({ policy, token, onDone, onCancel }: { policy: PortalPolicy; token: string; onDone: (msg: string) => void; onCancel: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ number: string; agentName: string | null }>("/api/portal/claim", {
        method: "POST",
        token,
        body: JSON.stringify({ policyId: policy.id, date, description, location, amount }),
      });
      onDone(
        `Claim ${r.number} received.${r.agentName ? ` ${r.agentName.split(" ")[0]} has been told and will call you.` : " Your agent will call you."} Keep photos and receipts — you'll need them.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-2xl bg-sand p-4" noValidate>
      <p className="font-medium text-heading">Report a claim on {policy.number}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">When did it happen?</span>
          <input className={inputClass} type="date" max={today} min={policy.inception} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Where?</span>
          <input className={inputClass} value={location} maxLength={200} placeholder="Town / road" onChange={(e) => setLocation(e.target.value)} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">What happened?</span>
        <textarea className={cn(inputClass, "min-h-24")} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Estimated cost in KES (optional)</span>
        <input className={inputClass} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} />
      </label>
      {error ? <Alert>{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-mint disabled:opacity-60">
          {busy ? "Sending…" : "Send claim"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm text-mute hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-mute">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}
