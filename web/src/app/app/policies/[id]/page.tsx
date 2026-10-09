"use client";

import { SearchX } from "lucide-react";
import { useParams } from "next/navigation";
import { downloadTextFile } from "@/lib/documents/certificate";
import { updatePolicyRemote, usePaymentsBook, usePoliciesBook } from "@/lib/data";
import { applyPolicyLifecycle, issuePolicyCertificate, type PolicyLifecycleAction } from "@/lib/events/ledger";
import { money } from "@/lib/format";
import type { PolicyStatus } from "@/lib/types";
import { Badge, Button, Card, DetailSkeleton, Empty, PageHeader } from "@/components/ui";

const transitions: { label: string; action: PolicyLifecycleAction; status: PolicyStatus }[] = [
  { label: "Activate", action: "activate", status: "active" },
  { label: "Suspend", action: "suspend", status: "suspended" },
  { label: "Reinstate", action: "reinstate", status: "reinstated" },
  { label: "Cancel", action: "cancel", status: "cancelled" },
  { label: "Mark expired", action: "expire", status: "expired" },
  { label: "Lapse", action: "lapse", status: "lapsed" },
];

export default function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { policies, loading, refresh } = usePoliciesBook();
  const { payments } = usePaymentsBook();
  const policy = policies.find((p) => p.id === id);

  if (loading) return <DetailSkeleton label="Loading policy" />;
  if (!policy) return (
      <Card>
        <Empty
          icon={SearchX}
          title="Policy not found"
          hint="Check the policy number, or search for it with ⌘K."
          action={<Button href="/app/policies" variant="secondary">All policies</Button>}
        />
      </Card>
    );
  const relatedPays = payments.filter((p) => p.policyNumber === policy.number);
  const history = policy.history ?? [];

  function downloadCertificate() {
    const doc = issuePolicyCertificate(policy!);
    if (doc.body) downloadTextFile(doc.name, doc.body, doc.mime ?? "text/html");
  }

  async function runLifecycle(action: PolicyLifecycleAction) {
    const next = applyPolicyLifecycle(policy!, action);
    await updatePolicyRemote(policy!.id, {
      status: next.status,
      inception: next.inception,
      expiry: next.expiry,
      sumCovered: next.sumCovered,
      contribution: next.contribution,
      wakala: next.wakala,
      tabarru: next.tabarru,
      history: next.history,
      pendingEndorsement: next.pendingEndorsement,
    });
    refresh();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Policy"
        title={policy.number}
        description={`${policy.productName} · ${policy.participantName}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={downloadCertificate}>
              Download certificate
            </Button>
            <Button href={`/app/claims/new?policy=${policy.id}`}>File claim</Button>
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={policy.status} />
            <span className="text-sm text-mute">
              {policy.channel} · {policy.branch}
            </span>
          </div>
          <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
            <Item k="Inception" v={policy.inception} />
            <Item k="Expiry" v={policy.expiry} />
            <Item k="Sum covered" v={money(policy.sumCovered)} />
            <Item k="Contribution" v={`${money(policy.contribution)} / ${policy.frequency}`} />
            <Item k="Wakala fee" v={money(policy.wakala)} />
            <Item k="Tabarru" v={money(policy.tabarru)} />
            <Item k="Agent" v={policy.agentName ?? "Direct"} />
            <Item k="Certificate" v="Digital · ready" />
          </dl>
          <div className="mt-6 flex flex-wrap gap-2">
            {transitions.map((t) => (
              <Button key={t.status} variant="secondary" onClick={() => runLifecycle(t.action)}>
                {t.label}
              </Button>
            ))}
            <Button variant="secondary" onClick={() => runLifecycle("renew")}>
              Renew +1y
            </Button>
            <Button variant="secondary" onClick={() => runLifecycle("endorse")}>
              Endorse +10% SI
            </Button>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-xl">Audit history</h2>
          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto text-sm">
            {history.length === 0 ? (
              <li className="rounded-xl bg-sand px-3 py-2 text-mute">No endorsements yet — renew or endorse to log events.</li>
            ) : (
              history.map((h) => (
                <li key={h.id} className="rounded-xl bg-sand px-3 py-2">
                  <p className="font-medium capitalize">{h.action}</p>
                  <p className="text-xs text-mute">{h.summary}</p>
                  <p className="text-xs text-mute">{h.at.slice(0, 16).replace("T", " ")}</p>
                </li>
              ))
            )}
          </ul>
          <h3 className="mt-6 text-sm font-medium">Linked payments</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {relatedPays.length === 0 ? (
              <li className="text-mute">None yet</li>
            ) : (
              relatedPays.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.reference}</span>
                  <Badge status={p.status} />
                </li>
              ))
            )}
          </ul>
          <Button href="/app/documents" variant="ghost" className="mt-4">
            Open documents desk
          </Button>
        </Card>
      </div>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-mute">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
