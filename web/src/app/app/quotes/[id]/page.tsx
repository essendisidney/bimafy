"use client";

import { SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { persistPolicy, updateQuoteRemote, useQuotesBook } from "@/lib/data";
import { money } from "@/lib/format";
import { Badge, Button, Card, DetailSkeleton, Empty, PageHeader } from "@/components/ui";

function canConvertQuote(quote: { status: string; uwDecision: string }) {
  if (quote.status === "converted" || quote.status === "declined" || quote.status === "expired") {
    return false;
  }
  if (quote.uwDecision === "reject" || quote.uwDecision === "refer") return false;
  if (quote.status === "referred") return false;
  return quote.uwDecision === "auto_accept" || quote.uwDecision === "load";
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { operatorId } = useAuth();
  const { quotes, loading } = useQuotesBook();
  const quote = quotes.find((q) => q.id === id);

  if (loading) return <DetailSkeleton label="Loading quote" />;
  if (!quote) return (
      <Card>
        <Empty
          icon={SearchX}
          title="Quote not found"
          hint="It may have expired, or the link is mistyped."
          action={<Button href="/app/quotes" variant="secondary">All quotations</Button>}
        />
      </Card>
    );

  const convertible = canConvertQuote(quote);
  const awaitingUw = quote.status === "referred" || quote.uwDecision === "refer";

  return (
    <div>
      <PageHeader
        eyebrow="Quotation"
        title={quote.number}
        description={`${quote.participantName} · ${quote.productName}`}
        actions={
          convertible ? (
            <Button
              onClick={async () => {
                const policyId = crypto.randomUUID();
                const opId =
                  operatorId ?? process.env.NEXT_PUBLIC_OPERATOR_ID ?? "00000000-0000-4000-8000-000000000001";
                await persistPolicy(
                  {
                    id: policyId,
                    number: `POL-${quote.productId.slice(0, 4).toUpperCase()}-${Math.floor(Math.random() * 90000 + 10000)}`,
                    quoteId: quote.id,
                    participantId: quote.participantId,
                    participantName: quote.participantName,
                    productId: quote.productId,
                    productName: quote.productName,
                    agentId: quote.agentId,
                    brokerId: quote.brokerId,
                    branch: "Nairobi CBD",
                    status: "pending_payment",
                    channel: quote.channel,
                    inception: new Date().toISOString().slice(0, 10),
                    expiry: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
                    sumCovered: quote.sumCovered,
                    contribution: quote.total,
                    frequency: quote.frequency,
                    wakala: quote.wakala,
                    tabarru: quote.tabarru,
                    createdAt: new Date().toISOString(),
                  },
                  opId,
                );
                await updateQuoteRemote(quote.id, { status: "converted" });
                router.push(`/app/policies/${policyId}`);
              }}
            >
              Convert to policy
            </Button>
          ) : awaitingUw ? (
            <Button href="/app/underwriting" variant="secondary">
              Awaiting underwriter
            </Button>
          ) : undefined
        }
      />
      {awaitingUw ? (
        <p className="mb-4 rounded-xl border border-line bg-sand/50 px-4 py-3 text-sm text-mute">
          This quote is referred. Accept it on the Underwriting desk before converting — same rule as{" "}
          <code className="text-ink">/api/v1</code> binds.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-2 p-5 text-sm">
          <Row k="Status" v={<Badge status={quote.status} />} />
          <Row k="UW decision" v={<Badge status={quote.uwDecision} />} />
          <Row k="Sum covered" v={money(quote.sumCovered)} />
          <Row k="Total contribution" v={money(quote.total)} />
          <Row k="Wakala" v={money(quote.wakala)} />
          <Row k="Tabarru" v={money(quote.tabarru)} />
          <Row k="Levies" v={money(quote.levies)} />
          <Row k="Valid until" v={quote.validUntil} />
        </Card>
        <Card className="p-5 text-sm">
          <h2 className="font-display text-xl">Risk payload</h2>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-sand p-3 text-xs">{JSON.stringify(quote.risk, null, 2)}</pre>
          <p className="mt-3 text-mute">{quote.uwNotes}</p>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2">
      <span className="text-mute">{k}</span>
      <span>{v}</span>
    </div>
  );
}
