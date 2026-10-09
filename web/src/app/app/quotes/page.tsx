"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useQuotesBook } from "@/lib/data";
import { money } from "@/lib/format";
import { Badge, Button, Card, PageHeader, SkeletonRows, Table } from "@/components/ui";

export default function QuotesPage() {
  const { user } = useAuth();
  const { quotes, loading } = useQuotesBook();
  const rows = quotes.filter((q) => {
    if (!user) return false;
    if (user.role === "participant") return q.participantId === user.participantId;
    if (user.role === "agent") return q.agentId === user.agentId || !q.agentId;
    if (user.role === "broker") return q.brokerId === user.brokerId || q.channel === "broker";
    return true;
  });

  return (
    <div>
      <PageHeader
        eyebrow="Quotation engine"
        title="Instant contributions, taxes and levies"
        description="Customer + asset + risk in. Premium, wakala, tabarru, monthly and annual out."
        actions={<Button href="/app/quotes/new">New quote</Button>}
      />
      <Card className="p-2">
        {loading ? <SkeletonRows label="Loading quotes" /> : null}
        <Table headers={["Quote", "Participant", "Product", "Total", "UW", "Status", ""]}>
          {rows.map((q) => (
            <tr key={q.id} className="border-b border-line/70">
              <td className="px-3 py-3 font-medium">{q.number}</td>
              <td className="px-3 py-3">{q.participantName}</td>
              <td className="px-3 py-3">{q.productName}</td>
              <td className="px-3 py-3">{money(q.total)}</td>
              <td className="px-3 py-3"><Badge status={q.uwDecision} /></td>
              <td className="px-3 py-3"><Badge status={q.status} /></td>
              <td className="px-3 py-3 text-right">
                <Link href={`/app/quotes/${q.id}`} className="text-teal">Open</Link>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
