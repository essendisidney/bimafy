"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useClaimsBook } from "@/lib/data";
import { money } from "@/lib/format";
import { Badge, Button, Card, PageHeader, SkeletonRows, Table } from "@/components/ui";

export default function ClaimsPage() {
  const { user } = useAuth();
  const { claims, loading } = useClaimsBook();
  const rows = claims.filter((c) => {
    if (user?.role === "participant") return c.participantId === user.participantId;
    if (user?.role === "claims_assessor") {
      return !c.assessor || c.assessor === user.name || ["reported", "under_review", "fraud_check", "documents_pending"].includes(c.status);
    }
    return true;
  });

  return (
    <div>
      <PageHeader
        eyebrow="Claims"
        title={user?.role === "claims_assessor" ? "Assessor queue" : "Digitized from FNOL to payout"}
        description={
          user?.role === "claims_assessor"
            ? "Claims assigned to you, plus unassigned intake ready for handoff."
            : "Photos, GPS, police abstract, OCR, assessor assignment, approval workflow and SLA monitoring."
        }
        actions={
          user?.role === "claims_assessor" ? undefined : <Button href="/app/claims/new">Report claim</Button>
        }
      />
      <Card className="p-2">
        {loading ? <SkeletonRows label="Loading claims" /> : null}
        <Table headers={["Claim", "Policy", "Participant", "Amount", "Fraud", "Status", "SLA", ""]}>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-line/70">
              <td className="px-3 py-3 font-medium">{c.number}</td>
              <td className="px-3 py-3">{c.policyNumber}</td>
              <td className="px-3 py-3">{c.participantName}</td>
              <td className="px-3 py-3">{money(c.claimed)}</td>
              <td className="px-3 py-3">{c.fraudScore}</td>
              <td className="px-3 py-3"><Badge status={c.status} /></td>
              <td className="px-3 py-3 text-xs text-mute">{c.slaDue?.slice(0, 10)}</td>
              <td className="px-3 py-3 text-right"><Link className="text-teal" href={`/app/claims/${c.id}`}>Open</Link></td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
