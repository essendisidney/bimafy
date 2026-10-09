"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { priceQuote } from "@/lib/engines/quote";
import { products } from "@/lib/seed";
import { money } from "@/lib/format";
import type { Frequency } from "@/lib/types";
import { cn } from "@/components/ui";

type Need = {
  slug: string;
  label: string;
  ask?: { label: string; kind: "sum" | "age"; def: number; min: number; max: number; step: number };
};

const NEEDS: Need[] = [
  { slug: "motor-comprehensive", label: "My car", ask: { label: "Car value", kind: "sum", def: 1_200_000, min: 300_000, max: 8_000_000, step: 50_000 } },
  { slug: "boda-micro", label: "My boda" },
  { slug: "hospital-cash", label: "Hospital", ask: { label: "Your age", kind: "age", def: 32, min: 18, max: 65, step: 1 } },
  { slug: "family-takaful", label: "My family", ask: { label: "Cover amount", kind: "sum", def: 1_000_000, min: 200_000, max: 5_000_000, step: 100_000 } },
  { slug: "gadget", label: "My phone", ask: { label: "Phone value", kind: "sum", def: 45_000, min: 10_000, max: 250_000, step: 5_000 } },
  { slug: "janaaza", label: "Funeral", ask: { label: "Cover amount", kind: "sum", def: 100_000, min: 20_000, max: 200_000, step: 10_000 } },
];

const PER: Record<Frequency, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  quarterly: "quarter",
  annually: "year",
  single: "trip",
};

/** Zero-signup pricing on the landing page — the same engine the console binds with. */
export function InstantQuote() {
  const router = useRouter();
  const { loginAs } = useAuth();
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

  function buy() {
    loginAs("u-part");
    router.push(`/app/quotes/new?product=${product.slug}`);
  }

  return (
    <div className="rounded-[1.75rem] border border-line bg-surface p-6 shadow-lift md:p-7">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal">Your price, right now</p>
      <p className="mt-1 text-sm text-mute">No sign-up. No call-back. Pick what you want covered.</p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {NEEDS.map((n) => (
          <button
            key={n.slug}
            onClick={() => setNeedSlug(n.slug)}
            aria-pressed={n.slug === need.slug}
            className={cn(
              "rounded-xl border px-2 py-2.5 text-sm transition",
              n.slug === need.slug ? "border-teal bg-teal text-white" : "border-line bg-white text-ink hover:border-teal",
            )}
          >
            {n.label}
          </button>
        ))}
      </div>

      {need.ask ? (
        <label className="mt-5 block text-sm">
          <span className="flex items-baseline justify-between">
            <span className="font-medium">{need.ask.label}</span>
            <span className="text-mute">{need.ask.kind === "sum" ? money(input) : `${input} yrs`}</span>
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
        <p className="mt-5 text-sm text-mute">Personal accident + third party for riders. One flat price.</p>
      )}

      <div className="mt-5 rounded-2xl bg-forest p-5 text-champagne">
        <p className="text-xs uppercase tracking-[0.18em] text-gold">{product.name}</p>
        <p className="mt-2 font-display text-5xl text-white" aria-live="polite">
          {money(Math.max(1, Math.round(quote.total)))}
          <span className="ml-1 font-sans text-base text-champagne/80">/ {PER[frequency]}</span>
        </p>
        <p className="mt-2 text-xs text-champagne/75">
          Includes IRA levies & stamp duty · {Math.round((product.wakalaRate || 0) * 100)}% operator fee, rest goes to the
          shared pool — and surplus comes back to you.
        </p>
        <p className="mt-1 text-xs text-champagne/75">
          {quote.uwDecision === "auto_accept" ? "✓ Instantly approved — cover starts when M-Pesa clears." : quote.uwNotes}
        </p>
      </div>

      <button
        onClick={buy}
        className="mt-4 w-full rounded-xl bg-teal px-5 py-3 text-sm font-medium text-white transition hover:bg-mint"
      >
        Get covered — pay with M-Pesa
      </button>
    </div>
  );
}

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
