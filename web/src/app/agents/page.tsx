import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, MapPin, MessageSquareText } from "lucide-react";
import { PublicHeader } from "@/components/public/public-header";
import { Stars } from "@/components/public/stars";
import { firstName, listPublicAgents, ratingLabel } from "@/lib/public-agents";

export const metadata: Metadata = {
  title: "Find a Bimafy agent",
  description: "Licensed Bimafy insurance agents near you, rated by the customers they serve.",
};
export const revalidate = 60;

export default async function AgentsPage() {
  let agents: Awaited<ReturnType<typeof listPublicAgents>> = [];
  let failed = false;
  try {
    agents = await listPublicAgents();
  } catch {
    failed = true;
  }

  return (
    <div className="min-h-dvh bg-paper">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-4 pb-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal">Licensed agents</p>
        <h1 className="mt-2 font-display text-4xl text-heading sm:text-5xl">Find a Bimafy agent</h1>
        <p className="mt-3 max-w-2xl text-mute">
          Every agent here is licensed and rated only by customers who actually bought cover from them. Pick one,
          get your price, and they call you.
        </p>

        {failed ? (
          <p className="mt-8 rounded-2xl border border-line bg-surface p-6 text-sm text-mute">
            We couldn&apos;t load the agents right now. Please try again in a minute.
          </p>
        ) : agents.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
            <p className="font-medium text-heading">Our agents are setting up their profiles.</p>
            <p className="mt-1 text-sm text-mute">
              You can still get your price now and the nearest available agent will call you.
            </p>
            <Link href="/#quote" className="mt-4 inline-flex rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-on-accent">
              Get my price
            </Link>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/agents/${a.slug}`}
                  className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-teal"
                >
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-forest font-display text-lg text-gold">
                      {a.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-xl text-heading">{a.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-mute">
                        <Stars value={a.rating} />
                        {ratingLabel(a)}
                      </p>
                    </div>
                  </div>
                  {a.bio ? <p className="mt-3 line-clamp-3 text-sm text-ink">{a.bio}</p> : null}
                  <div className="mt-auto space-y-1.5 pt-4 text-xs text-mute">
                    {a.counties.length ? (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="size-3.5" aria-hidden />
                        {a.counties.join(", ")}
                      </p>
                    ) : null}
                    <p className="flex items-center gap-1.5">
                      <MessageSquareText className="size-3.5" aria-hidden />
                      {a.languages.join(" · ")}
                    </p>
                    {a.licensed ? (
                      <p className="flex items-center gap-1.5 text-teal-ink">
                        <BadgeCheck className="size-3.5" aria-hidden />
                        Licensed agent
                      </p>
                    ) : null}
                  </div>
                  <span className="mt-4 rounded-xl bg-teal/10 px-3 py-2 text-center text-sm font-semibold text-teal-ink">
                    Get a quote from {firstName(a.name)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
