"use client";

import { EnterAs, InstantQuote } from "@/components/instant-quote";
import { useLang } from "@/lib/lang";

const COPY = {
  en: {
    eyebrow: "Insurance, at the speed of M-Pesa",
    headline: "See your price before you finish reading this sentence.",
    body: "InsuraX prices, approves and issues cover in one flow — for the person buying it, the agent selling it, and the insurer carrying it.",
    doors: [
      {
        who: "I need cover",
        promise: "Price in seconds, pay with M-Pesa, certificate on WhatsApp.",
        cta: "Open my cover",
        userId: "u-part",
        href: "/app/customer",
      },
      {
        who: "I sell insurance",
        promise: "Today's follow-ups, renewals at risk and same-day commission — on one screen.",
        cta: "Open my agent desk",
        userId: "u-agent",
        href: "/app/agent",
      },
      {
        who: "I run an insurer, MGA or broker",
        promise: "Products, underwriting, claims, collections and IRA reporting on one ledger.",
        cta: "Open the operator console",
        userId: "u-admin",
        href: "/app/dashboard",
      },
    ],
  },
  sw: {
    eyebrow: "Bima, kwa kasi ya M-Pesa",
    headline: "Ona bei yako kabla hujamaliza kusoma sentensi hii.",
    body: "InsuraX inapanga bei, inaidhinisha na kutoa bima kwa hatua moja — kwa anayenunua, wakala anayeuza, na kampuni inayobeba hatari.",
    doors: [
      {
        who: "Nahitaji bima",
        promise: "Bei kwa sekunde, lipa kwa M-Pesa, cheti kwa WhatsApp.",
        cta: "Fungua bima yangu",
        userId: "u-part",
        href: "/app/customer",
      },
      {
        who: "Nauza bima",
        promise: "Wateja wa kufuatilia leo, bima zinazokaribia kuisha na kamisheni siku hiyo hiyo — kwenye skrini moja.",
        cta: "Fungua dawati la wakala",
        userId: "u-agent",
        href: "/app/agent",
      },
      {
        who: "Naendesha kampuni ya bima, MGA au udalali",
        promise: "Bidhaa, uchambuzi wa hatari, madai, makusanyo na ripoti za IRA kwenye leja moja.",
        cta: "Fungua dashibodi ya mwendeshaji",
        userId: "u-admin",
        href: "/app/dashboard",
      },
    ],
  },
} as const;

/** Mobile order: headline → price → doors. Desktop: text left, price card right. */
export function LandingHero() {
  const t = COPY[useLang()];
  return (
    <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-14 pt-2 md:grid-cols-[1.05fr_0.95fr] md:gap-x-10 md:gap-y-8 md:pb-20 md:pt-4">
      <div className="animate-rise md:col-start-1 md:row-start-1 md:self-end">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-teal">{t.eyebrow}</p>
        <h1 className="mt-3 font-display text-4xl leading-[1.02] text-heading md:mt-4 md:text-6xl">{t.headline}</h1>
      </div>

      <div className="animate-rise-delay md:col-start-2 md:row-span-2 md:row-start-1 md:self-center">
        <InstantQuote />
      </div>

      <div className="animate-rise md:col-start-1 md:row-start-2">
        <p className="max-w-lg text-lg leading-relaxed text-mute">{t.body}</p>
        <div className="mt-8 space-y-2">
          {t.doors.map((d) => (
            <EnterAs
              key={d.userId}
              userId={d.userId}
              href={d.href}
              className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-surface/70 px-4 py-3 text-left transition hover:border-teal hover:bg-surface"
            >
              <span>
                <span className="block font-medium text-heading">{d.who}</span>
                <span className="block text-sm text-mute">{d.promise}</span>
              </span>
              <span className="shrink-0 text-sm font-medium text-teal transition group-hover:translate-x-0.5">
                {d.cta} →
              </span>
            </EnterAs>
          ))}
        </div>
      </div>
    </section>
  );
}
