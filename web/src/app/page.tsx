import Link from "next/link";
import { EnterAs, InstantQuote } from "@/components/instant-quote";
import { modules } from "@/lib/modules";

const DOORS = [
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
];

const MOAT = [
  {
    title: "One ledger, not five vendors",
    body: "Quote, policy, M-Pesa collection, commission, claim and reinsurance cession post to the same book in the same second. Competitors stitch a PAS, a payments gateway, a CRM and spreadsheets — and reconcile at month-end.",
  },
  {
    title: "Built for how Kenya actually pays",
    body: "Daily and weekly micro-premiums, M-Pesa STK and paybill, USSD for feature phones, WhatsApp for everything else, and a field app that works offline. Not a European platform with M-Pesa bolted on.",
  },
  {
    title: "Takaful-native, conventional-ready",
    body: "Wakala, Mudarabah and hybrid models with tabarru pools and surplus distribution approved by a Shariah board — a market most core systems cannot serve at all.",
  },
  {
    title: "Agents earn more, so they bring their book",
    body: "Lead scoring, renewal radar, cross-sell gaps and instant commission withdrawals. Distribution is the scarce asset in African insurance; we win it by making every agent more productive.",
  },
  {
    title: "Every claim makes underwriting smarter",
    body: "Fraud signals, IPRS / NTSA / CRB checks and claims outcomes feed back into pricing and straight-through decisions. More volume → sharper risk → cheaper cover → more volume.",
  },
  {
    title: "Embed anywhere in an afternoon",
    body: "SACCOs, ride-hailing apps, lenders and retailers sell cover through one partner API — quote, bind and claim — with their own branding and commission split.",
  },
];

const AGENT_REASONS = [
  ["Know who to call first", "Every lead scored hot, warm or cold with the reason why — and the next best action."],
  ["Never lose a renewal", "Expiring policies ranked by lapse risk, with one-tap WhatsApp reminders and win-back lists."],
  ["Get paid today", "Commission statement per policy, clawbacks shown upfront, withdraw to M-Pesa in one tap."],
  ["Sell more to people who already trust you", "Cross-sell radar finds the cover gaps in your existing clients."],
  ["Works where you work", "Offline field app for the stage, the shamba and the market — syncs when signal returns."],
];

export default function Home() {
  return (
    <div className="min-h-screen atmosphere text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="brand-mark text-3xl tracking-[0.08em] text-forest">InsuraX</div>
        <nav className="flex items-center gap-4 text-sm">
          <a href="#why" className="hidden text-mute transition hover:text-ink sm:inline">
            Why InsuraX
          </a>
          <a href="#agents" className="hidden text-mute transition hover:text-ink sm:inline">
            For agents
          </a>
          <Link href="/login" className="rounded-xl bg-forest px-4 py-2.5 text-champagne transition hover:bg-navy">
            Sign in
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-14 pt-4 md:grid-cols-[1.05fr_0.95fr] md:items-center md:pb-20">
          <div className="animate-rise">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-teal">
              Insurance, at the speed of M-Pesa
            </p>
            <h1 className="mt-4 font-display text-5xl leading-[1.02] text-forest md:text-6xl">
              See your price before you finish reading this sentence.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-mute">
              InsuraX prices, approves and issues cover in one flow — for the person buying it, the agent selling it,
              and the insurer carrying it.
            </p>

            <div className="mt-8 space-y-2">
              {DOORS.map((d) => (
                <EnterAs
                  key={d.userId}
                  userId={d.userId}
                  href={d.href}
                  className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-white/70 px-4 py-3 text-left transition hover:border-teal hover:bg-white"
                >
                  <span>
                    <span className="block font-medium text-forest">{d.who}</span>
                    <span className="block text-sm text-mute">{d.promise}</span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-teal transition group-hover:translate-x-0.5">
                    {d.cta} →
                  </span>
                </EnterAs>
              ))}
            </div>
          </div>

          <div className="animate-rise-delay">
            <InstantQuote />
          </div>
        </section>

        <section id="why" className="border-t border-line/80 bg-white/50 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-teal">Why InsuraX</p>
            <h2 className="mt-3 max-w-3xl font-display text-4xl text-forest md:text-5xl">
              Others sell policies. We run the whole machine — so it gets cheaper and faster with every customer.
            </h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2 lg:grid-cols-3">
              {MOAT.map((m, i) => (
                <div key={m.title} className="bg-paper p-6">
                  <p className="font-display text-3xl text-gold">0{i + 1}</p>
                  <h3 className="mt-2 font-display text-2xl text-forest">{m.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mute">{m.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="agents" className="py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-10 overflow-hidden rounded-[2rem] atmosphere-deep px-8 py-12 text-champagne md:grid-cols-[1fr_1.1fr] md:px-12">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-gold">For agents</p>
                <h2 className="mt-4 font-display text-4xl text-white md:text-5xl">
                  Open the app. Know exactly who to call and how much you&apos;ll earn.
                </h2>
                <p className="mt-4 max-w-md text-champagne/80">
                  The best agents don&apos;t work harder — they work the right lead at the right time. InsuraX does the
                  sorting so you can do the selling.
                </p>
                <EnterAs
                  userId="u-agent"
                  href="/app/agent"
                  className="mt-8 inline-flex rounded-xl bg-gold px-5 py-3 text-sm font-medium text-ink transition hover:bg-champagne"
                >
                  Try the agent desk — no sign-up
                </EnterAs>
              </div>
              <ul className="space-y-4">
                {AGENT_REASONS.map(([title, body]) => (
                  <li key={title} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="font-medium text-white">{title}</p>
                    <p className="text-sm text-champagne/80">{body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="platform" className="border-t border-line/80 bg-white/50 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-teal">Under the hood</p>
            <h2 className="mt-3 font-display text-4xl text-forest md:text-5xl">Ten products. One source of truth.</h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2 lg:grid-cols-5">
              {modules.map((mod) => (
                <div key={mod.slug} className="bg-paper p-5 transition hover:bg-white">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal">{mod.code}</p>
                  <h3 className="mt-2 font-display text-2xl text-forest">{mod.name.replace("InsuraX ", "")}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mute">{mod.tagline}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
