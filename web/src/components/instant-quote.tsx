"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { priceQuote } from "@/lib/engines/quote";
import { useLang, type Lang } from "@/lib/lang";
import { products } from "@/lib/seed";
import { money } from "@/lib/format";
import type { Frequency } from "@/lib/types";
import { cn } from "@/components/ui";

type Ask = { kind: "sum" | "age"; def: number; min: number; max: number; step: number; label: Record<Lang, string> };
type Need = { slug: string; label: Record<Lang, string>; ask?: Ask };

const NEEDS: Need[] = [
  {
    slug: "motor-comprehensive",
    label: { en: "My car", sw: "Gari langu" },
    ask: { kind: "sum", def: 1_200_000, min: 300_000, max: 8_000_000, step: 50_000, label: { en: "Car value", sw: "Thamani ya gari" } },
  },
  { slug: "boda-micro", label: { en: "My boda", sw: "Boda yangu" } },
  {
    slug: "hospital-cash",
    label: { en: "Hospital", sw: "Hospitali" },
    ask: { kind: "age", def: 32, min: 18, max: 65, step: 1, label: { en: "Your age", sw: "Umri wako" } },
  },
  {
    slug: "family-takaful",
    label: { en: "My family", sw: "Familia yangu" },
    ask: { kind: "sum", def: 1_000_000, min: 200_000, max: 5_000_000, step: 100_000, label: { en: "Cover amount", sw: "Kiasi cha bima" } },
  },
  {
    slug: "gadget",
    label: { en: "My phone", sw: "Simu yangu" },
    ask: { kind: "sum", def: 45_000, min: 10_000, max: 250_000, step: 5_000, label: { en: "Phone value", sw: "Thamani ya simu" } },
  },
  {
    slug: "janaaza",
    label: { en: "Funeral", sw: "Mazishi" },
    ask: { kind: "sum", def: 100_000, min: 20_000, max: 200_000, step: 10_000, label: { en: "Cover amount", sw: "Kiasi cha bima" } },
  },
];

const PER: Record<Lang, Record<Frequency, string>> = {
  en: { daily: "day", weekly: "week", monthly: "month", quarterly: "quarter", annually: "year", single: "trip" },
  sw: { daily: "siku", weekly: "wiki", monthly: "mwezi", quarterly: "robo mwaka", annually: "mwaka", single: "safari" },
};

const DAYS_PER: Record<Frequency, number> = { daily: 1, weekly: 7, monthly: 365 / 12, quarterly: 365 / 4, annually: 365, single: 0 };

const COPY = {
  en: {
    eyebrow: "Your price, right now",
    sub: "No sign-up. No call-back. Pick what you want covered.",
    years: "yrs",
    flat: "Personal accident + third party for riders. One flat price.",
    perDay: (v: string) => `≈ ${v} a day`,
    whereTitle: "Where every shilling goes",
    pool: "Shared claims pool",
    fee: "Operator fee",
    levies: "Government levies",
    surplus: "Pool money left after claims is shared back with members as surplus.",
    approved: "✓ Instantly approved — cover starts when M-Pesa clears.",
    cta: "Get covered — pay with M-Pesa",
    share: "Send this quote on WhatsApp",
    shareText: (product: string, price: string, extra: string, url: string) =>
      `My InsuraX quote: ${product} — ${price}${extra}. See yours in seconds: ${url}`,
  },
  sw: {
    eyebrow: "Bei yako, sasa hivi",
    sub: "Bila kujisajili. Bila kusubiri simu. Chagua unachotaka kukinga.",
    years: "miaka",
    flat: "Ajali binafsi + mtu wa tatu kwa waendesha boda. Bei moja.",
    perDay: (v: string) => `≈ ${v} kwa siku`,
    whereTitle: "Kila shilingi inaenda wapi",
    pool: "Mfuko wa pamoja wa madai",
    fee: "Ada ya mwendeshaji",
    levies: "Ushuru wa serikali",
    surplus: "Pesa inayobaki kwenye mfuko baada ya madai hurudishwa kwa wanachama kama ziada.",
    approved: "✓ Imeidhinishwa papo hapo — bima inaanza malipo ya M-Pesa yakikamilika.",
    cta: "Pata bima — lipa kwa M-Pesa",
    share: "Tuma bei hii kwa WhatsApp",
    shareText: (product: string, price: string, extra: string, url: string) =>
      `Bei yangu ya InsuraX: ${product} — ${price}${extra}. Ona yako kwa sekunde: ${url}`,
  },
} as const;

/** Zero-signup pricing on the landing page — the same engine the console binds with. */
export function InstantQuote() {
  const router = useRouter();
  const { loginAs } = useAuth();
  const lang = useLang();
  const t = COPY[lang];
  const [needSlug, setNeedSlug] = useState(NEEDS[0].slug);
  const need = NEEDS.find((n) => n.slug === needSlug) ?? NEEDS[0];
  const product = products.find((p) => p.slug === need.slug) ?? products[0];
  const [values, setValues] = useState<Record<string, number>>({});
  const input = need.ask ? values[need.slug] ?? need.ask.def : 0;
  const frequency = product.frequencies[0];

  const quote = useMemo(
    () =>
      priceQuote({
        product,
        participantId: "guest",
        participantName: "Guest",
        sumCovered: need.ask?.kind === "sum" ? input : product.maxSumCovered,
        frequency,
        channel: "web",
        risk: need.ask?.kind === "age" ? { age: input } : { age: 32, vehicleAge: 5 },
      }),
    [product, need, input, frequency],
  );

  const total = Math.max(1, Math.round(quote.total));
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
  }, []);

  // The card sits inside an animated (transformed) wrapper, which would trap a `fixed` child,
  // so the sticky bar is portalled to <body> once we're on the client.
  const onClient = useSyncExternalStore(noopSubscribe, () => true, () => false);

  function buy() {
    loginAs("u-part");
    router.push(`/app/quotes/new?product=${product.slug}`);
  }

  function share() {
    const extra = need.ask?.kind === "sum" ? ` (${need.ask.label[lang].toLowerCase()} ${money(input)})` : "";
    const text = t.shareText(product.name, priceLabel, extra, window.location.origin);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  return (
    <div className="rounded-[1.75rem] border border-line bg-surface p-5 shadow-lift md:p-7">
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
              n.slug === need.slug ? "border-teal bg-teal text-white" : "border-line bg-white text-ink hover:border-teal",
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
        <p className="mt-2 font-display text-5xl text-white" aria-live="polite">
          {money(total)}
          <span className="ml-1 font-sans text-base text-champagne/80">/ {PER[lang][frequency]}</span>
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

      <button
        ref={ctaRef}
        onClick={buy}
        className="mt-4 w-full rounded-xl bg-teal px-5 py-3 text-sm font-medium text-white transition hover:bg-mint"
      >
        {t.cta}
      </button>
      <button
        onClick={share}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-5 py-2.5 text-sm text-ink transition hover:border-teal hover:text-teal"
      >
        {t.share}
      </button>

      {onClient
        ? createPortal(
          <div
            className={cn(
              "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-lift backdrop-blur transition-transform md:hidden",
              ctaVisible ? "translate-y-full" : "translate-y-0",
            )}
            aria-hidden={ctaVisible}
          >
            <div className="mx-auto flex max-w-md items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs text-mute">{product.name}</p>
                <p className="font-display text-2xl leading-none text-forest">
                  {money(total)}
                  <span className="ml-1 font-sans text-xs text-mute">/ {PER[lang][frequency]}</span>
                </p>
              </div>
              <button
                onClick={buy}
                tabIndex={ctaVisible ? -1 : 0}
                className="shrink-0 rounded-xl bg-teal px-4 py-3 text-sm font-medium text-white transition hover:bg-mint"
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
