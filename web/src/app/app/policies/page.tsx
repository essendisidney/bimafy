"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { usePoliciesBook } from "@/lib/data";
import { money } from "@/lib/format";
import { Badge, Card, PageHeader, SkeletonRows, Table } from "@/components/ui";

export default function PoliciesPage() {
  const { user } = useAuth();
  const { policies, loading } = usePoliciesBook();
  const rows = policies.filter((p) => (user?.role === "participant" ? p.participantId === user.participantId : true));

  return (
    <div>
      <PageHeader
        eyebrow="Policy administration"
        title="Issue, renew, endorse, suspend"
        description="PAS is the heart of the platform — full lifecycle with digital certificates and audit history."
      />
      <Card className="p-2">
        {loading ? <SkeletonRows label="Loading policies" /> : null}
        <Table headers={["Policy", "Participant", "Product", "Status", "Contribution", "Expiry", ""]}>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-line/70">
              <td className="px-3 py-3 font-medium">{p.number}</td>
              <td className="px-3 py-3">{p.participantName}</td>
              <td className="px-3 py-3">{p.productName}</td>
              <td className="px-3 py-3"><Badge status={p.status} /></td>
              <td className="px-3 py-3">{money(p.contribution)}</td>
              <td className="px-3 py-3">{p.expiry}</td>
              <td className="px-3 py-3 text-right"><Link className="text-teal" href={`/app/policies/${p.id}`}>Open</Link></td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
