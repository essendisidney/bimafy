"use client";

import Link from "next/link";
import { computeKpis } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { updateClaimRemote, useClaimsBook, usePoliciesBook } from "@/lib/data";
import { scoreClaim } from "@/lib/engines/fraud";
import { pushNotification } from "@/lib/events/ledger";
import { money, pct } from "@/lib/format";
import { platformStore, usePlatform } from "@/lib/store";
import { Badge, Button, Card, PageHeader, Stat, Table } from "@/components/ui";

export default function FraudPage() {
  const { user } = useAuth();
  const demo = usePlatform();
  const { claims, refresh } = useClaimsBook();
  const { policies } = usePoliciesBook();
  const kpis = computeKpis({ ...demo, claims, policies });
  if (!user) return null;
  const actor = user.name;

  const ranked = [...claims].sort((a, b) => b.fraudScore - a.fraudScore);
  const flagged = ranked.filter((c) => c.fraudScore >= 60 || c.status === "fraud_check");

  async function decide(id: string, next: "under_review" | "fraud_check" | "rejected", label: string) {
    await updateClaimRemote(id, { status: next });
    const claim = claims.find((c) => c.id === id);
    platformStore.addAuditLog({
      action: `fraud.${label}`,
      actor: actor,
      subject: claim?.number ?? id,
      detail: `Fraud desk ${label} → ${next}.`,
    });
    pushNotification({
      channel: "email",
      title: `Fraud ${label}`,
      body: `${claim?.number ?? id} ${label} by ${actor}.`,
      href: claim ? `/app/claims/${claim.id}` : "/app/fraud",
    });
    refresh();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Bimafy Fraud"
        title="Fraud & anomaly detection"
        description="Clear, escalate, or hold payout before money moves. Every action writes an audit event."
      />
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Book fraud rate" value={pct(kpis.fraudRate)} />
        <Stat label="Flagged claims" value={String(flagged.length)} hint="Score ≥ 60 or fraud_check" />
        <Stat label="Highest score" value={ranked[0] ? String(ranked[0].fraudScore) : "—"} />
        <Stat label="Claims in book" value={String(claims.length)} />
      </div>

      <Card className="mt-6 p-2">
        <h2 className="px-3 pt-3 font-display text-xl">Investigation queue</h2>
        <Table headers={["Claim", "Participant", "Amount", "Score", "Status", "Signals", "Actions"]}>
          {ranked.map((c) => {
            const policy = policies.find((p) => p.id === c.policyId);
            const scored = policy ? scoreClaim(c, policy, claims.filter((h) => h.id !== c.id)) : { score: c.fraudScore, signals: [] };
            return (
              <tr key={c.id} className="border-b border-line/70">
                <td className="px-3 py-3 font-medium">{c.number}</td>
                <td className="px-3 py-3">{c.participantName}</td>
                <td className="px-3 py-3">{money(c.claimed)}</td>
                <td className="px-3 py-3">
                  <span className={c.fraudScore >= 60 ? "font-semibold text-danger" : "text-heading"}>
                    {c.fraudScore}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <Badge status={c.status} />
                </td>
                <td className="max-w-sm px-3 py-3 text-xs text-mute">
                  {scored.signals.length
                    ? scored.signals.map((s) => s.type.replaceAll("_", " ")).join(" · ")
                    : "No material signals"}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="secondary" onClick={() => void decide(c.id, "under_review", "cleared")}>
                      Clear
                    </Button>
                    <Button variant="ghost" onClick={() => void decide(c.id, "fraud_check", "escalated")}>
                      Escalate
                    </Button>
                    <Button variant="danger" onClick={() => void decide(c.id, "rejected", "held")}>
                      Hold
                    </Button>
                    <Link className="self-center text-sm text-teal" href={`/app/claims/${c.id}`}>
                      Open
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}
