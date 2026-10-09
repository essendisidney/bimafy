import Link from "next/link";
import { EnterAs } from "@/components/instant-quote";
import { LandingHero, LandingSteps } from "@/components/landing-hero";
import { Logo } from "@/components/logo";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { modules } from "@/lib/modules";

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
  ["Works where you work", "Install it on your phone. Capture leads at the stage, the shamba or the market — it syncs when signal returns."],
];

export default function Home() {
  return (
    <div className="min-h-screen atmosphere text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" aria-label="Bimafy home">
          <Logo className="text-[1.7rem]" markClassName="h-9 w-9" />
        </Link>
        <nav className="flex items-center gap-3 text-sm sm:gap-5">
          <a href="#how" className="hidden text-mute transition hover:text-ink md:inline">
            How it works
          </a>
          <a href="#agents" className="hidden text-mute transition hover:text-ink md:inline">
            For agents
          </a>
          <a href="#why" className="hidden text-mute transition hover:text-ink md:inline">
            Why Bimafy
          </a>
          <ThemeToggle className="hidden sm:flex" />
          <LangToggle />
          <Link
            href="/login"
            className="rounded-full bg-teal px-4 py-2.5 font-semibold text-on-accent shadow-soft transition hover:opacity-90"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main>
        <LandingHero />

        <div className="border-y border-line/80 bg-surface/60">
          <LandingSteps />
        </div>

        <section id="agents" className="py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-10 overflow-hidden rounded-[2rem] atmosphere-deep px-8 py-12 text-champagne md:grid-cols-[1fr_1.1fr] md:px-12">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">For agents</p>
                <h2 className="mt-4 font-display text-4xl text-white md:text-5xl">
                  Open the app. Know who to call — and what you&apos;ll earn.
                </h2>
                <p className="mt-4 max-w-md text-champagne/85">
                  The best agents don&apos;t work harder — they work the right lead at the right time. Bimafy does the
                  sorting, in English or Swahili, even with no signal.
                </p>
                <EnterAs
                  userId="u-agent"
                  href="/app/agent"
                  className="mt-8 inline-flex rounded-full bg-gold px-5 py-3 text-sm font-semibold text-forest transition hover:bg-champagne"
                >
                  Try the agent desk — no sign-up
                </EnterAs>
              </div>
              <ul className="space-y-3">
                {AGENT_REASONS.map(([title, body]) => (
                  <li key={title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" aria-hidden />
                    <span>
                      <span className="block font-semibold text-white">{title}</span>
                      <span className="block text-sm text-champagne/80">{body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="why" className="border-t border-line/80 bg-surface/60 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-ink">Why Bimafy</p>
            <h2 className="mt-3 max-w-3xl font-display text-4xl text-heading md:text-5xl">
              Others sell policies. We run the whole machine — so cover gets cheaper and faster with every customer.
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {MOAT.map((m, i) => (
                <div key={m.title} className="rounded-3xl border border-line bg-paper p-6">
                  <p className="font-display text-sm text-gold-ink">0{i + 1}</p>
                  <h3 className="mt-2 font-display text-2xl text-heading">{m.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mute">{m.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="platform" className="py-16">
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-ink">Under the hood</p>
            <h2 className="mt-3 font-display text-4xl text-heading md:text-5xl">Ten products. One source of truth.</h2>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {modules.map((mod) => (
                <div key={mod.slug} className="rounded-2xl border border-line bg-surface p-5 transition hover:border-teal">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-ink">{mod.code}</p>
                  <h3 className="mt-2 font-display text-xl text-heading">{mod.name.replace("Bimafy ", "")}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mute">{mod.tagline}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-mute sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Logo className="text-2xl" markClassName="h-8 w-8" />
            <p className="mt-2">Insurance, simplified. · Bima, kwa urahisi.</p>
          </div>
          <div className="flex gap-5">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#agents" className="hover:text-ink">For agents</a>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
