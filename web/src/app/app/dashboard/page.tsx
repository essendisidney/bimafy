"use client";

import Link from "next/link";
import { computeKpis } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { useClaimsBook, usePaymentsBook, usePoliciesBook, useQuotesBook } from "@/lib/data";
import { money, pct } from "@/lib/format";
import { useLeads } from "@/lib/leads";
import { usePlatform } from "@/lib/store";
import { Badge, Button, Card, PageHeader, Stat } from "@/components/ui";

export default function DashboardPage() {
  const { user, mode } = useAuth();
  const demo = usePlatform();
  const { leads } = useLeads();
  const { policies } = usePoliciesBook();
  const { claims } = useClaimsBook();
  const { quotes } = useQuotesBook();
  const { payments } = usePaymentsBook();
  const kpis = computeKpis({
    ...demo,
    quotes,
    policies,
    claims,
    payments,
  });
  if (!user) return null;

  const myPolicies = policies.filter((p) => p.participantId === user.participantId);
  const myClaims = claims.filter((c) => c.participantId === user.participantId);
  const myQuotes = quotes.filter((q) => q.participantId === user.participantId || q.agentId === user.agentId);
  const nextDue = myPolicies.find((p) => p.status === "active" || p.status === "pending_payment");
  const mySurplus = demo.surplusPeriods
    .flatMap((p) => p.shares.filter((s) => s.participantId === user.participantId).map((s) => ({ ...s, period: p })))
    .sort((a, b) => (a.period.declaredAt ?? "").localeCompare(b.period.declaredAt ?? ""))
    .at(-1);

  return (
    <div>
      <PageHeader
        eyebrow={`Home · ${mode}`}
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="InsuraX runs the full insurance value chain. This desk is filtered to your role."
        actions={<Button href="/app/quotes/new">New quotation</Button>}
      />

      {user.role === "participant" ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="Active covers" value={String(myPolicies.filter((p) => p.status === "active").length)} />
            <Stat label="Open claims" value={String(myClaims.filter((c) => !["paid", "closed", "rejected"].includes(c.status)).length)} />
            <Stat
              label="Next contribution"
              value={nextDue ? money(nextDue.contribution) : "—"}
              hint={nextDue ? `${nextDue.productName} · ${nextDue.frequency}` : "No active cover"}
            />
            <Stat
              label="Surplus share"
              value={mySurplus ? money(mySurplus.shareAmount) : "—"}
              hint={mySurplus ? `${mySurplus.period.code} · ${mySurplus.status}` : "No declaration yet"}
            />
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-xl">Your policies</h2>
                <Link href="/app/policies" className="text-sm text-teal">View all</Link>
              </div>
              <div className="space-y-3">
                {myPolicies.map((p) => (
                  <Link key={p.id} href={`/app/policies/${p.id}`} className="block rounded-xl border border-line p-3 hover:border-teal">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{p.productName}</p>
                      <Badge status={p.status} />
                    </div>
                    <p className="text-xs text-mute">{p.number} · {money(p.contribution)} / {p.frequency}</p>
                  </Link>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="font-display text-xl">Self-service</h2>
              <div className="mt-4 grid gap-2">
                {[
                  ["/app/customer", "Self-service desk"],
                  ["/app/products", "Buy cover"],
                  ["/app/claims/new", "File a claim"],
                  ["/app/payments", "Pay contribution"],
                  ["/app/documents", "Download certificate"],
                  ["/app/profile", "Update KYC / profile"],
                ].map(([href, label]) => (
                  <Link key={href} href={href} className="rounded-xl bg-sand px-4 py-3 text-sm hover:bg-line">
                    {label}
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Stat label="Gross written contribution" value={money(kpis.gwp)} hint="Live book, annualized" />
            <Stat label="Net written" value={money(kpis.nwp)} hint="After notional cession" />
            <Stat label="Loss ratio" value={pct(kpis.lossRatio)} />
            <Stat label="Combined ratio" value={pct(kpis.combined)} />
            <Stat label="Active policies" value={String(kpis.active)} />
            <Stat label="Renewal rate" value={pct(kpis.renewalRate)} />
            <Stat label="Fraud rate" value={pct(kpis.fraudRate)} />
            <Stat label="Claims TAT" value={`${kpis.tatHours}h`} hint="Average first decision" />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-5">
            {[
              ["Quotes", quotes.length, "/app/quotes"],
              ["Policies", policies.length, "/app/policies"],
              ["Collections", payments.filter((p) => p.status === "completed" || p.status === "reconciled").length, "/app/payments"],
              ["Open claims", claims.filter((c) => !["paid", "closed", "rejected"].includes(c.status)).length, "/app/claims"],
              ["AI actions", quotes.filter((q) => q.status === "referred").length + claims.filter((c) => c.fraudScore >= 60).length, "/app/ai"],
            ].map(([label, value, href]) => (
              <Link key={String(label)} href={String(href)} className="rounded-xl border border-line bg-white px-4 py-3 hover:border-teal">
                <p className="text-[10px] uppercase tracking-[0.16em] text-mute">{label}</p>
                <p className="mt-1 font-display text-2xl text-forest">{value}</p>
              </Link>
            ))}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="font-display text-xl">Work queue</h2>
              <div className="mt-4 space-y-3 text-sm">
                {user.role === "claims_assessor" ? (
                  <>
                    <Row
                      href="/app/claims"
                      title="Claims in your queue"
                      value={String(
                        claims.filter(
                          (c) =>
                            c.assessor === user.name ||
                            ["assigned", "assessing", "estimated"].includes(c.status),
                        ).length,
                      )}
                    />
                    <Row
                      href="/app/fraud"
                      title="Fraud flags"
                      value={String(claims.filter((c) => c.fraudScore >= 60 || c.status === "fraud_check").length)}
                    />
                  </>
                ) : (
                  <>
                    {(user.role === "underwriter" || user.role === "admin" || user.role === "branch_manager") && (
                      <Row href="/app/underwriting" title="Quotes referred to UW" value={String(quotes.filter((q) => q.status === "referred").length)} />
                    )}
                    <Row href="/app/claims" title="Claims awaiting action" value={String(claims.filter((c) => !["paid", "closed", "rejected"].includes(c.status)).length)} />
                    {(user.role === "claims_officer" || user.role === "admin" || user.role === "compliance") && (
                      <Row href="/app/fraud" title="Fraud flags" value={String(claims.filter((c) => c.fraudScore >= 60 || c.status === "fraud_check").length)} />
                    )}
                    <Row href="/app/payments" title="Failed collections" value={String(payments.filter((p) => p.status === "failed").length)} />
                    {(user.role === "call_center" || user.role === "admin" || user.role === "branch_manager" || user.role === "agent") && (
                      <Row href="/app/crm" title="Open care tickets" value={String(demo.tickets.filter((t) => t.status !== "resolved").length)} />
                    )}
                    {(user.role === "agent" || user.role === "admin" || user.role === "branch_manager") && (
                      <Row href="/app/agent" title="Open leads" value={String(leads.filter((l) => l.status !== "won" && l.status !== "lost").length)} />
                    )}
                  </>
                )}
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="font-display text-xl">Recent quotations</h2>
              <div className="mt-4 space-y-3">
                {myQuotes.concat(quotes).slice(0, 4).map((q) => (
                  <Link key={q.id} href={`/app/quotes/${q.id}`} className="block rounded-xl border border-line p-3 hover:border-teal">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{q.productName}</p>
                      <Badge status={q.status} />
                    </div>
                    <p className="text-xs text-mute">{q.number} · {q.participantName} · {money(q.total)}</p>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ href, title, value }: { href: string; title: string; value: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 hover:border-teal">
      <span>{title}</span>
      <span className="font-medium">{value}</span>
    </Link>
  );
}
