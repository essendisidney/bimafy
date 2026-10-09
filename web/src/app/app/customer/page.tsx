"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useClaimsBook, usePoliciesBook, useQuotesBook } from "@/lib/data";
import { money } from "@/lib/format";
import { usePlatform } from "@/lib/store";
import { Badge, Button, Card, PageHeader, Stat } from "@/components/ui";

const ACTIONS = [
  ["/app/products", "Buy or renew cover"],
  ["/app/quotes/new", "Get a quotation"],
  ["/app/claims/new", "File a claim"],
  ["/app/payments", "Pay premium"],
  ["/app/documents", "Download certificate"],
  ["/app/profile", "Update KYC / profile"],
] as const;

export default function CustomerPage() {
  const { user } = useAuth();
  const demo = usePlatform();
  const { policies } = usePoliciesBook();
  const { claims } = useClaimsBook();
  const { quotes } = useQuotesBook();
  if (!user) return null;

  const mine = user.role === "participant";
  const myPolicies = mine ? policies.filter((p) => p.participantId === user.participantId) : policies.slice(0, 6);
  const myClaims = mine ? claims.filter((c) => c.participantId === user.participantId) : claims.slice(0, 6);
  const myQuotes = mine
    ? quotes.filter((q) => q.participantId === user.participantId)
    : quotes.slice(0, 4);
  const nextDue = myPolicies.find((p) => p.status === "active" || p.status === "pending_payment");
  const mySurplus = demo.surplusPeriods
    .flatMap((p) => p.shares.filter((s) => s.participantId === user.participantId).map((s) => ({ ...s, period: p })))
    .at(-1);

  return (
    <div>
      <PageHeader
        eyebrow="Bimafy Customer"
        title={mine ? "Your self-service desk" : "Customer self-service"}
        description={
          mine
            ? "Buy, pay, claim, and manage KYC without calling the office."
            : "The policyholder portal — preview how customers buy, pay, claim, and download certificates."
        }
        actions={<Button href="/app/quotes/new">New quotation</Button>}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Active covers" value={String(myPolicies.filter((p) => p.status === "active").length)} />
        <Stat
          label="Open claims"
          value={String(myClaims.filter((c) => !["paid", "closed", "rejected"].includes(c.status)).length)}
        />
        <Stat
          label="Next premium"
          value={nextDue ? money(nextDue.contribution) : "—"}
          hint={nextDue ? `${nextDue.productName} · ${nextDue.frequency}` : "No amount due"}
        />
        <Stat
          label="Surplus share"
          value={mySurplus ? money(mySurplus.shareAmount) : "—"}
          hint={mySurplus ? `${mySurplus.period.code} · ${mySurplus.status}` : "None declared"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-display text-xl">Do it yourself</h2>
          <div className="mt-4 grid gap-2">
            {ACTIONS.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-xl bg-sand px-4 py-3 text-sm hover:bg-line">
                {label}
              </Link>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl">Policies</h2>
            <Link href="/app/policies" className="text-sm text-teal">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {myPolicies.length === 0 ? <p className="text-sm text-mute">No policies yet.</p> : null}
            {myPolicies.map((p) => (
              <Link key={p.id} href={`/app/policies/${p.id}`} className="block rounded-xl border border-line p-3 hover:border-teal">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{p.productName}</p>
                  <Badge status={p.status} />
                </div>
                <p className="text-xs text-mute">
                  {p.number} · {money(p.contribution)} / {p.frequency}
                </p>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl">Claims & quotes</h2>
            <Link href="/app/claims" className="text-sm text-teal">
              Claims
            </Link>
          </div>
          <div className="space-y-3">
            {myClaims.slice(0, 3).map((c) => (
              <Link key={c.id} href={`/app/claims/${c.id}`} className="block rounded-xl border border-line p-3 hover:border-teal">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{c.number}</p>
                  <Badge status={c.status} />
                </div>
                <p className="text-xs text-mute">{money(c.claimed)}</p>
              </Link>
            ))}
            {myQuotes.slice(0, 3).map((q) => (
              <Link key={q.id} href={`/app/quotes/${q.id}`} className="block rounded-xl border border-line p-3 hover:border-teal">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{q.productName}</p>
                  <Badge status={q.status} />
                </div>
                <p className="text-xs text-mute">
                  {q.number} · {money(q.total)}
                </p>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
