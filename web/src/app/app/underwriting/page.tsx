"use client";

import Link from "next/link";
import { updatePolicyRemote, updateQuoteRemote, usePoliciesBook, useQuotesBook } from "@/lib/data";
import { acceptPendingEndorsement, pushNotification } from "@/lib/events/ledger";
import { money } from "@/lib/format";
import { Button, Card, PageHeader, Table } from "@/components/ui";

export default function UnderwritingPage() {
  const { quotes, refresh } = useQuotesBook();
  const { policies, refresh: refreshPolicies } = usePoliciesBook();
  const referred = quotes.filter((q) => q.status === "referred" || q.uwDecision === "refer");
  const pendingEndorsements = policies.filter(
    (p) => p.status === "pending_underwriting" && p.pendingEndorsement,
  );

  return (
    <div>
      <PageHeader
        eyebrow="Underwriting engine"
        title="Automate, refer, or load"
        description="Quote referrals and material endorsements (≥5% SI) land here before bind or certificate re-issue."
      />
      <Card className="p-2">
        <h2 className="px-3 pt-3 font-display text-xl">Referred quotes</h2>
        <Table headers={["Quote", "Participant", "Product", "Contribution", "Notes", "Action"]}>
          {referred.map((q) => (
            <tr key={q.id} className="border-b border-line/70">
              <td className="px-3 py-3 font-medium">{q.number}</td>
              <td className="px-3 py-3">{q.participantName}</td>
              <td className="px-3 py-3">{q.productName}</td>
              <td className="px-3 py-3">{money(q.total)}</td>
              <td className="max-w-xs px-3 py-3 text-xs text-mute">{q.uwNotes}</td>
              <td className="px-3 py-3">
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await updateQuoteRemote(q.id, { status: "priced", uwDecision: "auto_accept" });
                      pushNotification({
                        channel: "email",
                        title: "Quote accepted",
                        body: `${q.number} cleared by underwriting. Ready to convert.`,
                        href: `/app/quotes/${q.id}`,
                      });
                      refresh();
                    }}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      await updateQuoteRemote(q.id, { status: "declined", uwDecision: "reject" });
                      pushNotification({
                        channel: "email",
                        title: "Quote declined",
                        body: `${q.number} declined by underwriting.`,
                        href: `/app/quotes/${q.id}`,
                      });
                      refresh();
                    }}
                  >
                    Decline
                  </Button>
                  <Button href={`/app/quotes/${q.id}`} variant="ghost" className="!px-2">
                    Open
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
        {referred.length === 0 ? (
          <p className="p-6 text-sm text-mute">No referred quotes. Create a high-risk quote to populate this queue.</p>
        ) : null}
      </Card>

      <Card className="mt-4 p-2">
        <h2 className="px-3 pt-3 font-display text-xl">Pending endorsements</h2>
        <Table headers={["Policy", "Participant", "Current SI", "Requested SI", "Contribution Δ", "Action"]}>
          {pendingEndorsements.map((p) => {
            const pe = p.pendingEndorsement!;
            return (
              <tr key={p.id} className="border-b border-line/70">
                <td className="px-3 py-3">
                  <Link className="font-medium text-teal" href={`/app/policies/${p.id}`}>
                    {p.number}
                  </Link>
                </td>
                <td className="px-3 py-3">{p.participantName}</td>
                <td className="px-3 py-3">{money(p.sumCovered)}</td>
                <td className="px-3 py-3">{money(pe.sumCovered)}</td>
                <td className="px-3 py-3">
                  {money(p.contribution)} → {money(pe.contribution)}
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        const next = acceptPendingEndorsement(p);
                        await updatePolicyRemote(p.id, {
                          status: next.status,
                          sumCovered: next.sumCovered,
                          contribution: next.contribution,
                          wakala: next.wakala,
                          tabarru: next.tabarru,
                          pendingEndorsement: undefined,
                          history: next.history,
                        });
                        refreshPolicies();
                      }}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="danger"
                      onClick={async () => {
                        await updatePolicyRemote(p.id, {
                          status: "active",
                          pendingEndorsement: undefined,
                          history: p.history,
                        });
                        pushNotification({
                          channel: "email",
                          title: "Endorsement declined",
                          body: `${p.number} SI increase declined by underwriting.`,
                          href: `/app/policies/${p.id}`,
                        });
                        refreshPolicies();
                      }}
                    >
                      Decline
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
        {pendingEndorsements.length === 0 ? (
          <p className="p-6 text-sm text-mute">No pending endorsements. Use Endorse +10% SI on a policy.</p>
        ) : null}
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="font-display text-xl">Example rules</h2>
        <ul className="mt-3 space-y-2 text-sm text-mute">
          <li>IF age &gt; 65 on family/medical THEN reject</li>
          <li>IF vehicle age &gt; 15 THEN refer to underwriter</li>
          <li>IF medical condition = Diabetes THEN load +15%</li>
          <li>IF claims in last 3 years ≥ 3 THEN refer</li>
          <li>IF CRB score &lt; 400 THEN reject · &lt; 550 refer · &lt; 650 load +10%</li>
          <li>IF endorsement SI increase ≥ 5% THEN refer (pending underwriting)</li>
        </ul>
      </Card>
    </div>
  );
}
