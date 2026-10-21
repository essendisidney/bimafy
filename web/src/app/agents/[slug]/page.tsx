import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, CalendarDays, MapPin, MessageSquareText } from "lucide-react";
import { InstantQuote } from "@/components/instant-quote";
import { PublicHeader } from "@/components/public/public-header";
import { Stars } from "@/components/public/stars";
import { firstName, getPublicAgent, ratingLabel } from "@/lib/public-agents";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const agent = await getPublicAgent(slug).catch(() => null);
  if (!agent) return { title: "Agent not found · Bimafy" };
  return {
    title: `${agent.name} · Bimafy agent`,
    description: agent.bio ?? `${agent.name}, licensed Bimafy agent. Get your price and ${firstName(agent.name)} calls you.`,
  };
}

export default async function AgentPage({ params }: Props) {
  const { slug } = await params;
  const agent = await getPublicAgent(slug).catch(() => null);
  if (!agent) notFound();
  const first = firstName(agent.name);
  const since = new Date(agent.since).toLocaleDateString("en-KE", { month: "long", year: "numeric" });

  return (
    <div className="min-h-dvh bg-paper">
      <PublicHeader />
      <main className="mx-auto grid max-w-5xl gap-8 px-4 pb-16 md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <section>
          <Link href="/agents" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden />
            All agents
          </Link>
          <div className="mt-4 flex items-start gap-4">
            <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-forest font-display text-2xl text-gold">
              {agent.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </span>
            <div>
              <h1 className="font-display text-4xl text-heading">{agent.name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-mute">
                <Stars value={agent.rating} />
                {ratingLabel(agent)}
              </p>
            </div>
          </div>

          {agent.bio ? <p className="mt-5 text-lg leading-relaxed text-ink">{agent.bio}</p> : null}

          <ul className="mt-5 space-y-2 text-sm text-ink">
            {agent.licensed ? (
              <li className="flex items-center gap-2 text-teal-ink">
                <BadgeCheck className="size-4" aria-hidden />
                Licensed insurance agent
              </li>
            ) : null}
            {agent.counties.length ? (
              <li className="flex items-center gap-2">
                <MapPin className="size-4 text-mute" aria-hidden />
                Serves {agent.counties.join(", ")}
              </li>
            ) : null}
            <li className="flex items-center gap-2">
              <MessageSquareText className="size-4 text-mute" aria-hidden />
              Speaks {agent.languages.join(", ")}
            </li>
            <li className="flex items-center gap-2">
              <CalendarDays className="size-4 text-mute" aria-hidden />
              With Bimafy since {since}
            </li>
          </ul>

          <h2 className="mt-10 font-display text-2xl text-heading">What customers say</h2>
          <p className="mt-1 text-xs text-mute">Only customers who bought cover through {first} can leave a review.</p>
          {agent.recent && agent.recent.length ? (
            <ul className="mt-4 space-y-3">
              {agent.recent.map((r, i) => (
                <li key={i} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Stars value={r.rating} />
                    <span className="text-xs text-mute">
                      {r.name ?? "Customer"} · {new Date(r.at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  {r.comment ? <p className="mt-2 text-sm text-ink">{r.comment}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-line p-4 text-sm text-mute">
              No reviews yet — {first} is new on Bimafy.
            </p>
          )}
        </section>

        <aside className="md:sticky md:top-6 md:self-start">
          <InstantQuote chosen={{ slug: agent.slug, name: agent.name }} />
        </aside>
      </main>
    </div>
  );
}
