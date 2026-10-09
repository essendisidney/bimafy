"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { updateClaimRemote, updateQuoteRemote, useClaimsBook, usePoliciesBook, useQuotesBook } from "@/lib/data";
import { recommendFromBook } from "@/lib/engines/decisioning";
import { pushNotification } from "@/lib/events/ledger";
import { usePlatform } from "@/lib/store";
import { Button, Card, PageHeader, Stat } from "@/components/ui";

export default function AiPage() {
  const { user } = useAuth();
  const demo = usePlatform();
  const { quotes, refresh: refreshQuotes } = useQuotesBook();
  const { policies } = usePoliciesBook();
  const { claims, refresh: refreshClaims } = useClaimsBook();
  const recs = recommendFromBook({ quotes, policies, claims, payments: demo.payments });
  const high = recs.filter((r) => r.severity === "high").length;

  async function apply(rec: (typeof recs)[number]) {
    if (!rec.subjectId) return;
    if (rec.action === "accept_quote") {
      await updateQuoteRemote(rec.subjectId, { status: "priced", uwDecision: "auto_accept" });
      pushNotification({
        channel: "email",
        title: "AI-assisted UW",
        body: `${rec.title} accepted with human confirmation.`,
        href: rec.href,
      });
      refreshQuotes();
    }
    if (rec.action === "clear_fraud") {
      await updateClaimRemote(rec.subjectId, { status: "under_review" });
      pushNotification({
        channel: "email",
        title: "Fraud cleared",
        body: `${rec.title} returned to claims workflow.`,
        href: rec.href,
      });
      refreshClaims();
    }
    if (rec.action === "hold_payout") {
      await updateClaimRemote(rec.subjectId, { status: "fraud_check" });
      pushNotification({
        channel: "sms",
        title: "Payout held",
        body: `${rec.title} — money will not move until fraud clears.`,
        href: rec.href,
      });
      refreshClaims();
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Bimafy AI"
        title="Intelligence, automation & decisioning"
        description="Models score the live book. A human still confirms every bind, payout, and decline."
      />
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Open recommendations" value={String(recs.length)} />
        <Stat label="High severity" value={String(high)} />
        <Stat label="Quotes in book" value={String(quotes.length)} />
        <Stat label="Claims scored" value={String(claims.length)} />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-xl">Decision queue</h2>
        <p className="mt-1 text-sm text-mute">
          {user?.name.split(" ")[0]}, these are explainable next-best actions from Risk, Fraud, Pay, and Customer.
        </p>
        <div className="mt-4 space-y-3">
          {recs.length === 0 ? <p className="text-sm text-mute">Book is clean — no material decisions waiting.</p> : null}
          {recs.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-line p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal">
                  {r.module} · {r.severity}
                </p>
                <p className="mt-1 font-medium">{r.title}</p>
                <p className="mt-1 text-sm text-mute">{r.detail}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button href={r.href} variant="secondary">
                  Open
                </Button>
                {r.action && r.subjectId ? (
                  <Button onClick={() => void apply(r)}>{r.action.replaceAll("_", " ")}</Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4 p-5 text-sm">
        <p className="font-medium">How it decides</p>
        <p className="mt-2 text-mute">
          Quote referrals use the underwriting rules engine. Claims use fraud signals (early claim, duplicates, frequency, amount).
          Renewals and failed collections come from the PAS book. OCR / IPRS / NTSA sandboxes stay on{" "}
          <Link href="/app/integrations" className="text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal">
            Bimafy Connect
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
