"use client";

import { CheckCircle2, Lock, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { money } from "@/lib/format";
import { useLang } from "@/lib/lang";
import type { PayLinkView } from "@/lib/pay-links";
import { cn, inputClass } from "@/components/ui";

type Phase = "loading" | "ready" | "waiting" | "paid" | "failed" | "missing" | "expired";

const COPY = {
  en: {
    hi: (n: string) => `Hi ${n},`,
    lead: "Pay for your cover with M-Pesa. You'll get a prompt on your phone to enter your PIN.",
    purpose: { premium: "Premium", instalment: "Instalment", renewal: "Renewal" },
    policy: "Policy",
    agent: "Your agent",
    number: "M-Pesa number to charge",
    hint: (h: string) => `On file: ${h}`,
    pay: (a: string) => `Pay ${a} with M-Pesa`,
    sending: "Sending…",
    waiting: "Check your phone and enter your M-Pesa PIN.",
    waitingSub: "This page updates by itself once M-Pesa confirms.",
    paid: "Paid — thank you!",
    paidSub: (r: string | null) => `${r ? `M-Pesa receipt ${r}. ` : ""}Your cover is active.`,
    failed: "The payment didn't go through.",
    retry: "Try again",
    missing: "This payment link doesn't exist. Please check the link or ask your agent for a new one.",
    expired: "This payment link has expired. Ask your agent to send a new one.",
    secure: "Secure M-Pesa payment · Bimafy, a product of Pesara Limited",
  },
  sw: {
    hi: (n: string) => `Habari ${n},`,
    lead: "Lipia bima yako kwa M-Pesa. Utapata ombi kwenye simu yako la kuweka PIN.",
    purpose: { premium: "Malipo", instalment: "Awamu", renewal: "Kuhuisha" },
    policy: "Bima",
    agent: "Wakala wako",
    number: "Namba ya M-Pesa ya kulipa",
    hint: (h: string) => `Iliyosajiliwa: ${h}`,
    pay: (a: string) => `Lipa ${a} kwa M-Pesa`,
    sending: "Inatuma…",
    waiting: "Angalia simu yako na uweke PIN ya M-Pesa.",
    waitingSub: "Ukurasa huu utajisasisha M-Pesa ikithibitisha.",
    paid: "Imelipwa — asante!",
    paidSub: (r: string | null) => `${r ? `Risiti ya M-Pesa ${r}. ` : ""}Bima yako iko hai.`,
    failed: "Malipo hayakufanikiwa.",
    retry: "Jaribu tena",
    missing: "Kiungo hiki cha malipo hakipo. Angalia kiungo au muombe wakala wako kipya.",
    expired: "Kiungo hiki kimeisha muda. Muombe wakala wako akutumie kipya.",
    secure: "Malipo salama ya M-Pesa · Bimafy, bidhaa ya Pesara Limited",
  },
} as const;

/** The page a client opens from an agent's SMS: see what you're paying for, pay by M-Pesa, done. */
export function PayLinkPage({ token }: { token: string }) {
  const lang = useLang();
  const t = COPY[lang];
  const [link, setLink] = useState<PayLinkView | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/pay/${encodeURIComponent(token)}`, { cache: "no-store" });
    if (res.status === 404) return setPhase("missing");
    if (!res.ok) return setPhase("missing");
    const view = (await res.json()) as PayLinkView;
    setLink(view);
    setReceipt((r) => view.receipt ?? r);
    // A payment M-Pesa already confirmed on this page is never shown as unpaid again.
    setPhase((prev) => (view.status === "paid" || prev === "paid" ? "paid" : view.status === "expired" ? "expired" : "ready"));
  }, [token]);

  useEffect(() => {
    // Loading the link is an external fetch, so it starts from an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // While the prompt is on the client's phone, ask M-Pesa (via our status route) every 3 seconds.
  useEffect(() => {
    if (phase !== "waiting" || !checkout) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/payments/mpesa/status?checkoutRequestId=${encodeURIComponent(checkout)}`, { cache: "no-store" });
      if (!res.ok) return;
      const row = (await res.json()) as { status: string; receipt?: string; resultDesc?: string };
      if (row.status === "completed") {
        setReceipt(row.receipt ?? null);
        setPhase("paid");
        void load();
      } else if (row.status === "failed") {
        setError(row.resultDesc ?? null);
        setPhase("failed");
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [phase, checkout, load]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pay/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; checkoutRequestId?: string };
      if (!res.ok || !json.checkoutRequestId) throw new Error(json.error ?? "M-Pesa request failed");
      setCheckout(json.checkoutRequestId);
      setPhase("waiting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "M-Pesa request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto max-w-md">
        <Logo className="text-3xl" markClassName="h-9 w-9" />
        <div className="mt-6 rounded-[1.75rem] border border-line bg-surface p-5 shadow-lift sm:p-7">
          {phase === "loading" ? (
            <div className="space-y-3" aria-busy>
              <div className="h-6 w-1/2 animate-pulse rounded bg-sand" />
              <div className="h-24 animate-pulse rounded-2xl bg-sand" />
              <div className="h-11 animate-pulse rounded-xl bg-sand" />
            </div>
          ) : phase === "missing" || phase === "expired" || !link ? (
            <p className="text-sm text-ink">{phase === "expired" ? t.expired : t.missing}</p>
          ) : (
            <>
              <p className="font-display text-2xl text-heading">{t.hi(link.first_name)}</p>
              <p className="mt-1 text-sm text-mute">{t.lead}</p>

              <div className="mt-5 rounded-2xl bg-forest p-5 text-champagne">
                <p className="text-xs uppercase tracking-[0.18em] text-gold">
                  {link.note || t.purpose[link.purpose]}
                </p>
                <p className="mt-2 font-display text-5xl leading-tight text-white">{money(Number(link.amount))}</p>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-champagne/75">{link.product_name}</dt>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-champagne/75">{t.policy}</dt>
                    <dd className="text-white">{link.policy_number}</dd>
                  </div>
                  {link.agent_name ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-champagne/75">{t.agent}</dt>
                      <dd className="text-white">{link.agent_name}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              {phase === "paid" ? (
                <div role="status" className="mt-5 rounded-2xl border border-teal/25 bg-teal/10 p-4">
                  <p className="flex items-center gap-2 font-display text-xl text-heading">
                    <CheckCircle2 className="size-5 text-teal" aria-hidden />
                    {t.paid}
                  </p>
                  <p className="mt-1 text-sm text-ink">{t.paidSub(receipt)}</p>
                </div>
              ) : phase === "waiting" ? (
                <div role="status" className="mt-5 rounded-2xl border border-gold/30 bg-gold/15 p-4">
                  <p className="flex items-center gap-2 font-medium text-heading">
                    <Smartphone className="size-5 animate-pulse text-gold-ink" aria-hidden />
                    {t.waiting}
                  </p>
                  <p className="mt-1 text-sm text-mute">{t.waitingSub}</p>
                </div>
              ) : (
                <form onSubmit={pay} className="mt-5 space-y-3" noValidate>
                  {phase === "failed" ? (
                    <p role="alert" className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
                      {t.failed} {error}
                    </p>
                  ) : null}
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">{t.number}</span>
                    <input
                      className={inputClass}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="07XX XXX XXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                    {link.phone_hint ? <span className="mt-1 block text-xs text-mute">{t.hint(link.phone_hint)}</span> : null}
                  </label>
                  {error && phase !== "failed" ? (
                    <p role="alert" className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
                      {error}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={busy}
                    className={cn(
                      "w-full rounded-xl bg-teal px-5 py-3.5 text-base font-semibold text-on-accent transition hover:bg-mint",
                      busy && "opacity-60",
                    )}
                  >
                    {busy ? t.sending : phase === "failed" ? t.retry : t.pay(money(Number(link.amount)))}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-mute">
          <Lock className="size-3.5" aria-hidden />
          {t.secure}
        </p>
      </div>
    </main>
  );
}
