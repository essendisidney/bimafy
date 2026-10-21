"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { DAYS_PER, NEEDS, PER, priceNeed } from "@/lib/instant-quote";
import { useLang } from "@/lib/lang";
import { money } from "@/lib/format";
import { cn, inputClass } from "@/components/ui";

const COPY = {
  en: {
    eyebrow: "Your price, right now",
    sub: "No sign-up. Pick what you want covered and see your price in seconds.",
    years: "yrs",
    flat: "Personal accident + third party for riders. One flat price.",
    perDay: (v: string) => `≈ ${v} a day`,
    whereTitle: "Where every shilling goes",
    pool: "Shared claims pool",
    fee: "Operator fee",
    levies: "Government levies",
    surplus: "Pool money left after claims is shared back with members as surplus.",
    approved: "✓ Instantly approved — cover starts when M-Pesa clears.",
    cta: "Get covered — an agent calls you",
    formTitle: "Where should we call you?",
    formHint: "A licensed Bimafy agent calls you, answers questions and sends the M-Pesa request. No obligation.",
    name: "Your name",
    phone: "Mobile number",
    send: "Request a call",
    sending: "Sending…",
    back: "Back to the price",
    thanks: (first: string) => `Asante, ${first}!`,
    callFrom: (agent: string) => `${agent} from Bimafy will call you shortly. We've sent you an SMS with the details.`,
    callAny: "A Bimafy agent will call you shortly. We've sent you an SMS with the details.",
    whatsapp: (agent: string) => `WhatsApp ${agent} now`,
    another: "Price something else",
    share: "Send this quote on WhatsApp",
    shareText: (product: string, price: string, extra: string, url: string) =>
      `My Bimafy quote: ${product} — ${price}${extra}. See yours in seconds: ${url}`,
  },
  sw: {
    eyebrow: "Bei yako, sasa hivi",
    sub: "Bila kujisajili. Chagua unachotaka kukinga na uone bei yako kwa sekunde.",
    years: "miaka",
    flat: "Ajali binafsi + mtu wa tatu kwa waendesha boda. Bei moja.",
    perDay: (v: string) => `≈ ${v} kwa siku`,
    whereTitle: "Kila shilingi inaenda wapi",
    pool: "Mfuko wa pamoja wa madai",
    fee: "Ada ya mwendeshaji",
    levies: "Ushuru wa serikali",
    surplus: "Pesa inayobaki kwenye mfuko baada ya madai hurudishwa kwa wanachama kama ziada.",
    approved: "✓ Imeidhinishwa papo hapo — bima inaanza malipo ya M-Pesa yakikamilika.",
    cta: "Pata bima — wakala atakupigia",
    formTitle: "Tukupigie wapi?",
    formHint: "Wakala wa Bimafy aliyesajiliwa atakupigia, kujibu maswali na kukutumia ombi la M-Pesa. Bila lazima.",
    name: "Jina lako",
    phone: "Namba ya simu",
    send: "Omba kupigiwa",
    sending: "Inatuma…",
    back: "Rudi kwenye bei",
    thanks: (first: string) => `Asante, ${first}!`,
    callFrom: (agent: string) => `${agent} wa Bimafy atakupigia simu hivi punde. Tumekutumia SMS yenye maelezo.`,
    callAny: "Wakala wa Bimafy atakupigia simu hivi punde. Tumekutumia SMS yenye maelezo.",
    whatsapp: (agent: string) => `WhatsApp ${agent} sasa`,
    another: "Angalia bei nyingine",
    share: "Tuma bei hii kwa WhatsApp",
    shareText: (product: string, price: string, extra: string, url: string) =>
      `Bei yangu ya Bimafy: ${product} — ${price}${extra}. Ona yako kwa sekunde: ${url}`,
  },
} as const;

/** Zero-signup pricing on the landing page — the same engine the console binds with. */
export function InstantQuote() {
  const lang = useLang();
  const t = COPY[lang];
  const [needSlug, setNeedSlug] = useState(NEEDS[0].slug);
  const [values, setValues] = useState<Record<string, number>>({});
  // "price" → "form" (name + phone) → "done" (agent assigned, SMS sent).
  const [step, setStep] = useState<"price" | "form" | "done">("price");
  const { need, product, input, frequency, quote, total } = useMemo(
    () => priceNeed(needSlug, values[needSlug])!,
    [needSlug, values],
  );
  const priceLabel = `${money(total)} / ${PER[lang][frequency]}`;
  const perDay = DAYS_PER[frequency] > 1 ? Math.round(quote.total / DAYS_PER[frequency]) : null;
  const levies = quote.taxes + quote.levies;
  const parts = [
    { key: "pool", label: t.pool, value: quote.tabarru, tone: "bg-mint" },
    { key: "fee", label: t.fee, value: quote.wakala, tone: "bg-gold" },
    { key: "levies", label: t.levies, value: levies, tone: "bg-champagne/40" },
  ];
  const partsTotal = parts.reduce((s, p) => s + p.value, 0) || 1;

  // Mobile: keep the price and the buy button one thumb away while the real button is off-screen.
  const ctaRef = useRef<HTMLButtonElement>(null);
  const [ctaVisible, setCtaVisible] = useState(true);
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setCtaVisible(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
    // The button is re-mounted when the visitor comes back to the price.
  }, [step]);

  // The card sits inside an animated (transformed) wrapper, which would trap a `fixed` child,
  // so the sticky bar is portalled to <body> once we're on the client.
  const onClient = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [trap, setTrap] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<{ name: string | null; phone: string | null }>({ name: null, phone: null });
  const cardRef = useRef<HTMLDivElement>(null);

  function buy() {
    setStep("form");
    setError(null);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function requestCall(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/public/request-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, need: need.slug, value: input, lang, company: trap }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; agentName?: string | null; agentPhone?: string | null };
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setAgent({ name: json.agentName ?? null, phone: json.agentPhone ?? null });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  function share() {
    const extra = need.ask?.kind === "sum" ? ` (${need.ask.label[lang].toLowerCase()} ${money(input)})` : "";
    const text = t.shareText(product.name, priceLabel, extra, window.location.origin);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  return (
    <div ref={cardRef} className="scroll-mt-4 rounded-[1.75rem] border border-line bg-surface p-5 shadow-lift md:p-7">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal">{t.eyebrow}</p>
      <p className="mt-1 text-sm text-mute">{t.sub}</p>

      <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label={t.eyebrow}>
        {NEEDS.map((n) => (
          <button
            key={n.slug}
            role="radio"
            aria-checked={n.slug === need.slug}
            onClick={() => setNeedSlug(n.slug)}
            className={cn(
              "rounded-xl border px-2 py-2.5 text-sm transition",
              n.slug === need.slug ? "border-teal bg-teal text-on-accent" : "border-line bg-surface text-ink hover:border-teal",
            )}
          >
            {n.label[lang]}
          </button>
        ))}
      </div>

      {need.ask ? (
        <label className="mt-5 block text-sm">
          <span className="flex items-baseline justify-between">
            <span className="font-medium">{need.ask.label[lang]}</span>
            <span className="text-mute">{need.ask.kind === "sum" ? money(input) : `${input} ${t.years}`}</span>
          </span>
          <input
            type="range"
            className="mt-2 w-full accent-[var(--color-teal)]"
            min={need.ask.min}
            max={need.ask.max}
            step={need.ask.step}
            value={input}
            onChange={(e) => setValues((v) => ({ ...v, [need.slug]: Number(e.target.value) }))}
          />
        </label>
      ) : (
        <p className="mt-5 text-sm text-mute">{t.flat}</p>
      )}

      <div className="mt-5 rounded-2xl bg-forest p-5 text-champagne">
        <p className="text-xs uppercase tracking-[0.18em] text-gold">{product.name}</p>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 font-display text-[2.6rem] leading-tight text-white sm:text-5xl" aria-live="polite">
          <span className="whitespace-nowrap">{money(total)}</span>
          <span className="whitespace-nowrap font-sans text-base font-normal tracking-normal text-champagne/80">/ {PER[lang][frequency]}</span>
        </p>
        {perDay ? <p className="mt-1 text-sm text-champagne/85">{t.perDay(money(perDay))}</p> : null}

        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-champagne/70">{t.whereTitle}</p>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
            {parts.map((p) => (
              <div key={p.key} className={p.tone} style={{ width: `${(p.value / partsTotal) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-2 space-y-1 text-xs">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className={cn("inline-block h-2 w-2 rounded-full", p.tone)} />
                  {p.label}
                </span>
                <span className="tabular-nums text-white">{money(Math.round(p.value))}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-champagne/75">{t.surplus}</p>
        </div>

        <p className="mt-3 text-xs text-champagne/75">{quote.uwDecision === "auto_accept" ? t.approved : quote.uwNotes}</p>
      </div>

      {step === "price" ? (
        <>
          <button
            ref={ctaRef}
            onClick={buy}
            className="mt-4 w-full rounded-xl bg-teal px-5 py-3 text-sm font-medium text-on-accent transition hover:bg-mint"
          >
            {t.cta}
          </button>
          <button
            onClick={share}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 py-2.5 text-sm text-ink transition hover:border-teal hover:text-teal"
          >
            {t.share}
          </button>
        </>
      ) : step === "form" ? (
        <form onSubmit={requestCall} className="mt-4 space-y-3" noValidate>
          <div>
            <p className="font-display text-lg text-heading">{t.formTitle}</p>
            <p className="text-xs text-mute">{t.formHint}</p>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t.name}</span>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={80} autoFocus />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t.phone}</span>
            <input
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="07XX XXX XXX"
              required
            />
          </label>
          {/* Hidden from people; bots fill it in. */}
          <input
            type="text"
            name="company"
            value={trap}
            onChange={(e) => setTrap(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />
          {error ? (
            <p role="alert" className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-xl bg-teal px-5 py-3 text-sm font-medium text-on-accent transition hover:bg-mint disabled:opacity-60"
          >
            {sending ? t.sending : `${t.send} · ${money(total)} / ${PER[lang][frequency]}`}
          </button>
          <button type="button" onClick={() => setStep("price")} className="w-full py-1 text-sm text-mute hover:text-ink">
            {t.back}
          </button>
        </form>
      ) : (
        <div className="mt-4 rounded-2xl border border-teal/25 bg-teal/10 p-4" role="status">
          <p className="font-display text-xl text-heading">{t.thanks(name.trim().split(" ")[0])}</p>
          <p className="mt-1 text-sm text-ink">{agent.name ? t.callFrom(agent.name) : t.callAny}</p>
          {agent.phone && agent.name ? (
            <a
              href={`https://wa.me/${agent.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                `${lang === "sw" ? "Habari" : "Hi"} ${agent.name.split(" ")[0]}, ${lang === "sw" ? "ni" : "it's"} ${name.trim()} — ${product.name}, ${money(total)} / ${PER[lang][frequency]}.`,
              )}`}
              target="_blank"
              rel="noopener"
              className="mt-3 flex w-full items-center justify-center rounded-xl bg-teal px-5 py-3 text-sm font-medium text-on-accent transition hover:bg-mint"
            >
              {t.whatsapp(agent.name.split(" ")[0])}
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setStep("price")}
            className="mt-2 w-full py-1 text-sm text-mute hover:text-ink"
          >
            {t.another}
          </button>
        </div>
      )}

      {onClient
        ? createPortal(
          <div
            className={cn(
              "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-lift backdrop-blur transition-transform md:hidden",
              ctaVisible || step !== "price" ? "translate-y-full" : "translate-y-0",
            )}
            aria-hidden={ctaVisible || step !== "price"}
          >
            <div className="mx-auto flex max-w-md items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs text-mute">{product.name}</p>
                <p className="font-display text-2xl leading-none text-heading">
                  {money(total)}
                  <span className="ml-1 font-sans text-xs text-mute">/ {PER[lang][frequency]}</span>
                </p>
              </div>
              <button
                onClick={buy}
                tabIndex={ctaVisible || step !== "price" ? -1 : 0}
                className="shrink-0 rounded-xl bg-teal px-4 py-3 text-sm font-medium text-on-accent transition hover:bg-mint"
              >
                {lang === "sw" ? "Pata bima" : "Get covered"}
              </button>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}

const noopSubscribe = () => () => {};

/** One-click entry into a persona's workspace (demo mode). */
export function EnterAs({ userId, href, children, className }: { userId: string; href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const { loginAs } = useAuth();
  return (
    <button
      onClick={() => {
        loginAs(userId);
        router.push(href);
      }}
      className={className}
    >
      {children}
    </button>
  );
}
