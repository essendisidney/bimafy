import type { Metadata } from "next";
import { PublicHeader } from "@/components/public/public-header";
import { JoinForm } from "./join-form";

export const metadata: Metadata = {
  title: "Become a Bimafy agent",
  description: "Sell insurance with Bimafy: website leads, renewal reminders that collect M-Pesa, and a public profile your customers review.",
};

const REASONS: [string, string][] = [
  ["Customers come to you", "People who ask for cover on bimafy.vercel.app are sent to the least-busy agent, by SMS, within seconds."],
  ["Renewals that collect themselves", "Every customer gets reminders before cover ends, with a link to pay by M-Pesa in one tap."],
  ["Your own profile page", "Share your link on WhatsApp. Customers see your reviews and get a quote from you directly."],
  ["Claims without the chasing", "Customers send photos from their phone and get a text at every step, so they stop calling you."],
];

export default function JoinPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <PublicHeader />
      <main className="mx-auto grid max-w-5xl gap-10 px-4 pb-16 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal">For insurance agents</p>
          <h1 className="mt-2 font-display text-4xl text-heading sm:text-5xl">Sell more. Chase less.</h1>
          <p className="mt-3 text-mute">
            Bimafy is your back office in your pocket. Apply in two minutes; once we approve you, your login arrives
            by SMS and you can start selling the same day.
          </p>
          <ul className="mt-8 space-y-3">
            {REASONS.map(([title, body]) => (
              <li key={title} className="flex gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" aria-hidden />
                <span>
                  <span className="block font-semibold text-heading">{title}</span>
                  <span className="block text-sm text-mute">{body}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-mute">
            Have your IRA licence number ready. Agents whose licence we&apos;ve checked get a &ldquo;Licensed agent&rdquo;
            badge on their profile.
          </p>
        </div>
        <JoinForm />
      </main>
    </div>
  );
}
