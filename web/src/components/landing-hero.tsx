"use client";

import { FileCheck2, Smartphone, Wallet } from "lucide-react";
import { EnterAs, InstantQuote } from "@/components/instant-quote";
import { useLang } from "@/lib/lang";

const COPY = {
  en: {
    eyebrow: "Insurance, at the speed of M-Pesa",
    headline: ["Get ", "covered", " before your chai goes cold."],
    body: "Bimafy prices, approves and issues cover in one flow. Pay with M-Pesa, get your certificate on WhatsApp — and talk to a real agent whenever you want one.",
    perks: ["Pay with M-Pesa", "Certificate on WhatsApp", "Works on any phone"],
    doors: [
      {
        who: "I need cover",
        promise: "Price in seconds, pay with M-Pesa, certificate on WhatsApp.",
        cta: "Get covered",
        userId: "u-part",
        href: "/app/customer",
      },
      {
        who: "I sell insurance",
        promise: "Today's follow-ups, renewals at risk and same-day commission — on one screen.",
        cta: "Open agent desk",
        userId: "u-agent",
        href: "/app/agent",
      },
      {
        who: "I run an insurer, MGA or broker",
        promise: "Products, underwriting, claims, collections and IRA reporting on one ledger.",
        cta: "Open console",
        userId: "u-admin",
        href: "/app/dashboard",
      },
    ],
    stepsEyebrow: "How it works",
    stepsTitle: "Three taps. No paperwork.",
    steps: [
      { title: "Pick what to protect", body: "Car, boda, phone, hospital, family or funeral. Your price shows instantly — daily, weekly or monthly." },
      { title: "Pay with M-Pesa", body: "Approve the STK prompt on your phone. No bank account, no card, no branch visit." },
      { title: "Covered — proof on WhatsApp", body: "Your certificate arrives on WhatsApp. Claims start there too, with photos from your phone." },
    ],
  },
  sw: {
    eyebrow: "Bima, kwa kasi ya M-Pesa",
    headline: ["Pata ", "bima", " kabla chai yako haijapoa."],
    body: "Bimafy inapanga bei, inaidhinisha na kutoa bima kwa hatua moja. Lipa kwa M-Pesa, pokea cheti kwa WhatsApp — na uongee na wakala halisi wakati wowote.",
    perks: ["Lipa kwa M-Pesa", "Cheti kwa WhatsApp", "Inafanya kazi kwa simu yoyote"],
    doors: [
      {
        who: "Nahitaji bima",
        promise: "Bei kwa sekunde, lipa kwa M-Pesa, cheti kwa WhatsApp.",
        cta: "Pata bima",
        userId: "u-part",
        href: "/app/customer",
      },
      {
        who: "Nauza bima",
        promise: "Wateja wa kufuatilia leo, bima zinazokaribia kuisha na kamisheni siku hiyo hiyo — kwenye skrini moja.",
        cta: "Dawati la wakala",
        userId: "u-agent",
        href: "/app/agent",
      },
      {
        who: "Naendesha kampuni ya bima, MGA au udalali",
        promise: "Bidhaa, uchambuzi wa hatari, madai, makusanyo na ripoti za IRA kwenye leja moja.",
        cta: "Fungua dashibodi",
        userId: "u-admin",
        href: "/app/dashboard",
      },
    ],
    stepsEyebrow: "Jinsi inavyofanya kazi",
    stepsTitle: "Hatua tatu. Bila makaratasi.",
    steps: [
      { title: "Chagua unachotaka kulinda", body: "Gari, boda, simu, hospitali, familia au mazishi. Bei inaonekana papo hapo — kwa siku, wiki au mwezi." },
      { title: "Lipa kwa M-Pesa", body: "Kubali ombi la STK kwenye simu yako. Bila akaunti ya benki, kadi wala kwenda ofisini." },
      { title: "Umelindwa — cheti kwa WhatsApp", body: "Cheti chako kinafika kwa WhatsApp. Madai yanaanzia hapo pia, kwa picha kutoka simu yako." },
    ],
  },
} as const;

const PERK_ICONS = [Wallet, FileCheck2, Smartphone];

/** Mobile order: headline → price → doors. Desktop: text left, price card right. */
export function LandingHero() {
  const t = COPY[useLang()];
  const [before, highlight, after] = t.headline;
  return (
    <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-14 pt-4 md:grid-cols-[1.05fr_0.95fr] md:gap-x-12 md:gap-y-8 md:pb-24 md:pt-10">
      <div className="animate-rise md:col-start-1 md:row-start-1 md:self-end">
        <p className="inline-flex items-center gap-2 rounded-full border border-teal/25 bg-teal/10 px-3 py-1 text-xs font-semibold text-teal-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
          {t.eyebrow}
        </p>
        <h1 className="mt-4 font-display text-[2.6rem] leading-[1.02] text-heading md:text-[4.1rem]">
          {before}
          <span className="relative whitespace-nowrap text-teal-ink">
            {highlight}
            <svg viewBox="0 0 200 12" preserveAspectRatio="none" className="absolute -bottom-1 left-0 h-[0.32em] w-full" aria-hidden>
              <path d="M2 9 C 50 2, 120 2, 198 7" fill="none" stroke="var(--color-gold)" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </span>
          {after}
        </h1>
      </div>

      <div className="animate-rise-delay md:col-start-2 md:row-span-2 md:row-start-1 md:self-center">
        <InstantQuote />
      </div>

      <div className="animate-rise md:col-start-1 md:row-start-2">
        <p className="max-w-lg text-lg leading-relaxed text-mute">{t.body}</p>
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink">
          {t.perks.map((perk, i) => {
            const Icon = PERK_ICONS[i];
            return (
              <li key={perk} className="flex items-center gap-1.5">
                <Icon className="h-4 w-4 text-teal-ink" aria-hidden />
                {perk}
              </li>
            );
          })}
        </ul>
        <div className="mt-8 space-y-2">
          {t.doors.map((d) => (
            <EnterAs
              key={d.userId}
              userId={d.userId}
              href={d.href}
              className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-teal"
            >
              <span>
                <span className="block font-semibold text-heading">{d.who}</span>
                <span className="block text-sm text-mute">{d.promise}</span>
              </span>
              <span className="shrink-0 rounded-full bg-teal/10 px-3 py-1.5 text-sm font-semibold text-teal-ink transition group-hover:bg-teal group-hover:text-on-accent">
                {d.cta} →
              </span>
            </EnterAs>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingSteps() {
  const t = COPY[useLang()];
  return (
    <section id="how" className="py-16">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-ink">{t.stepsEyebrow}</p>
        <h2 className="mt-3 font-display text-4xl text-heading md:text-5xl">{t.stepsTitle}</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {t.steps.map((s, i) => (
            <li key={s.title} className="rounded-3xl border border-line bg-surface p-6 shadow-soft">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-teal font-display text-lg text-on-accent">
                {i + 1}
              </span>
              <h3 className="mt-4 font-display text-2xl text-heading">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mute">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
