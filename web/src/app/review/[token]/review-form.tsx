"use client";

import Link from "next/link";
import { CheckCircle2, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { cn, inputClass } from "@/components/ui";
import { useLang } from "@/lib/lang";
import type { ReviewInvite } from "@/app/api/public/review/[token]/route";

const COPY = {
  en: {
    title: (a: string) => `How was ${a}?`,
    sub: (n: string | null, p: string | null) => `${n ? `${n}, your` : "Your"} review helps other people choose a good agent${p ? ` for ${p.toLowerCase()}` : ""}.`,
    stars: ["Very poor", "Poor", "Okay", "Good", "Excellent"],
    comment: "Anything to add? (optional)",
    placeholder: "What did they do well? What could be better?",
    send: "Send review",
    sending: "Sending…",
    pick: "Tap the stars to rate",
    thanks: "Thank you!",
    thanksSub: (a: string) => `Your review is now on ${a}'s profile.`,
    seeProfile: "See the profile",
    used: "This review link has already been used. Thank you!",
    expired: "This review link has expired.",
    missing: "This review link doesn't exist.",
    note: "Only your first name is shown with your review.",
  },
  sw: {
    title: (a: string) => `${a} alikuhudumia vipi?`,
    sub: (n: string | null) => `${n ? `${n}, maoni` : "Maoni"} yako yanasaidia wengine kuchagua wakala mzuri.`,
    stars: ["Mbaya sana", "Mbaya", "Wastani", "Mzuri", "Bora kabisa"],
    comment: "Ungependa kuongeza nini? (si lazima)",
    placeholder: "Alifanya nini vizuri? Nini kingeboreshwa?",
    send: "Tuma maoni",
    sending: "Inatuma…",
    pick: "Gusa nyota kutoa alama",
    thanks: "Asante!",
    thanksSub: (a: string) => `Maoni yako sasa yako kwenye wasifu wa ${a}.`,
    seeProfile: "Ona wasifu",
    used: "Kiungo hiki tayari kimetumika. Asante!",
    expired: "Kiungo hiki kimeisha muda.",
    missing: "Kiungo hiki hakipo.",
    note: "Jina lako la kwanza pekee ndilo litaonekana.",
  },
} as const;

/** One-time rating for the agent who served this customer. */
export function ReviewForm({ token }: { token: string }) {
  const lang = useLang();
  const t = COPY[lang];
  const [invite, setInvite] = useState<ReviewInvite | null>(null);
  const [state, setState] = useState<"loading" | "missing" | "form" | "done">("loading");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/review/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) return setState("missing");
        setInvite((await res.json()) as ReviewInvite);
        setState("form");
      })
      .catch(() => !cancelled && setState("missing"));
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setError(t.pick);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/review/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Couldn't save your review");
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your review");
    } finally {
      setBusy(false);
    }
  }

  const agentFirst = invite?.agent_name.split(" ")[0] ?? "";

  return (
    <main className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto max-w-md">
        <Logo className="text-3xl" markClassName="h-9 w-9" />
        <div className="mt-6 rounded-[1.75rem] border border-line bg-surface p-5 shadow-lift sm:p-7">
          {state === "loading" ? (
            <div className="space-y-3" aria-busy>
              <div className="h-7 w-2/3 animate-pulse rounded bg-sand" />
              <div className="h-12 animate-pulse rounded-xl bg-sand" />
            </div>
          ) : state === "missing" || !invite ? (
            <p className="text-sm text-ink">{t.missing}</p>
          ) : invite.status !== "open" && state !== "done" ? (
            <p className="text-sm text-ink">{invite.status === "used" ? t.used : t.expired}</p>
          ) : state === "done" ? (
            <div role="status">
              <p className="flex items-center gap-2 font-display text-2xl text-heading">
                <CheckCircle2 className="size-6 text-teal" aria-hidden />
                {t.thanks}
              </p>
              <p className="mt-1 text-sm text-ink">{t.thanksSub(agentFirst)}</p>
              {invite.agent_slug ? (
                <Link href={`/agents/${invite.agent_slug}`} className="mt-4 inline-flex rounded-xl border border-line px-4 py-2.5 text-sm hover:border-teal">
                  {t.seeProfile}
                </Link>
              ) : null}
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <h1 className="font-display text-2xl text-heading">{t.title(agentFirst)}</h1>
              <p className="mt-1 text-sm text-mute">{t.sub(invite.first_name, invite.product_name)}</p>
              <div className="mt-5 flex justify-center gap-2" role="radiogroup" aria-label={t.pick}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} – ${t.stars[n - 1]}`}
                    onClick={() => setRating(n)}
                    className="rounded-lg p-1 transition active:scale-90"
                  >
                    <Star className={cn("size-10", n <= rating ? "fill-gold text-gold" : "text-line")} aria-hidden />
                  </button>
                ))}
              </div>
              <p className="mt-1 h-5 text-center text-sm text-mute">{rating ? t.stars[rating - 1] : t.pick}</p>
              <label className="mt-4 block text-sm">
                <span className="mb-1 block font-medium">{t.comment}</span>
                <textarea
                  className={cn(inputClass, "min-h-24")}
                  maxLength={500}
                  value={comment}
                  placeholder={t.placeholder}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              {error ? (
                <p role="alert" className="mt-3 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                className="mt-4 w-full rounded-xl bg-teal px-5 py-3.5 text-base font-semibold text-on-accent transition hover:bg-mint disabled:opacity-60"
              >
                {busy ? t.sending : t.send}
              </button>
              <p className="mt-3 text-center text-xs text-mute">{t.note}</p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
