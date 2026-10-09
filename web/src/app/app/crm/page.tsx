"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { participants } from "@/lib/seed";
import { useAuth } from "@/lib/auth";
import { pushNotification } from "@/lib/events/ledger";
import { money } from "@/lib/format";
import { platformStore, usePlatform } from "@/lib/store";
import type { Ticket } from "@/lib/types";
import { Badge, Button, Card, Field, PageHeader, Stat, Table, inputClass } from "@/components/ui";

export default function CrmPage() {
  const { user } = useAuth();
  const { tickets, policies, claims, quotes } = usePlatform();
  const [selectedId, setSelectedId] = useState(participants[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [channel, setChannel] = useState<Ticket["channel"]>("call");
  const [priority, setPriority] = useState<Ticket["priority"]>("normal");
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "pending" | "resolved">("open");
  const [linkPolicyId, setLinkPolicyId] = useState("");
  const [linkClaimId, setLinkClaimId] = useState("");

  const selected = participants.find((p) => p.id === selectedId) ?? participants[0];
  const openCount = tickets.filter((t) => t.status === "open").length;
  const pendingCount = tickets.filter((t) => t.status === "pending").length;
  const highCount = tickets.filter((t) => t.priority === "high" && t.status !== "resolved").length;

  const visible = tickets.filter((t) => (filter === "all" ? true : t.status === filter));

  const history = useMemo(() => {
    if (!selected) return { policies: [], claims: [], quotes: [] };
    return {
      policies: policies.filter((p) => p.participantId === selected.id),
      claims: claims.filter((c) => c.participantId === selected.id),
      quotes: quotes.filter((q) => q.participantId === selected.id),
    };
  }, [selected, policies, claims, quotes]);

  function createTicket() {
    if (!subject.trim() || !selected) return;
    const ticket: Ticket = {
      id: `tk-${crypto.randomUUID().slice(0, 8)}`,
      subject: subject.trim(),
      channel,
      status: "open",
      priority,
      participantName: selected.name,
      participantId: selected.id,
      policyId: linkPolicyId || undefined,
      claimId: linkClaimId || undefined,
      notes: notes.trim() || undefined,
      assignee: user?.name,
      createdAt: new Date().toISOString(),
    };
    platformStore.addTicket(ticket);
    pushNotification({
      channel: channel === "whatsapp" ? "whatsapp" : channel === "sms" ? "sms" : "email",
      title: "Care ticket opened",
      body: `${ticket.subject} · ${selected.name}${priority === "high" ? " (high priority)" : ""}`,
      href: ticket.claimId
        ? `/app/claims/${ticket.claimId}`
        : ticket.policyId
          ? `/app/policies/${ticket.policyId}`
          : "/app/crm",
    });
    setSubject("");
    setNotes("");
    setPriority("normal");
    setLinkPolicyId("");
    setLinkClaimId("");
  }

  return (
    <div>
      <PageHeader
        eyebrow="CRM"
        title="Care across every channel"
        description="Log tickets from call, WhatsApp, email or app, update status, and pull a participant 360 from the live book."
        actions={<Button href="/app/channels">Open channels</Button>}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Open" value={String(openCount)} />
        <Stat label="Pending" value={String(pendingCount)} />
        <Stat label="High priority" value={String(highCount)} />
        <Stat label="Resolved" value={String(tickets.filter((t) => t.status === "resolved").length)} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="space-y-3 p-5 xl:col-span-1">
          <h2 className="font-display text-xl">Log ticket</h2>
          <Field label="Participant">
            <select className={inputClass} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Subject">
            <input
              className={inputClass}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Certificate not downloading"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Channel">
              <select
                className={inputClass}
                value={channel}
                onChange={(e) => setChannel(e.target.value as Ticket["channel"])}
              >
                <option value="call">Call</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="app">App</option>
              </select>
            </Field>
            <Field label="Priority">
              <select
                className={inputClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value as Ticket["priority"])}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </Field>
          </div>
          <Field label="Notes">
            <textarea className={inputClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Field label="Link policy">
            <select className={inputClass} value={linkPolicyId} onChange={(e) => setLinkPolicyId(e.target.value)}>
              <option value="">None</option>
              {history.policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Link claim">
            <select className={inputClass} value={linkClaimId} onChange={(e) => setLinkClaimId(e.target.value)}>
              <option value="">None</option>
              {history.claims.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number}
                </option>
              ))}
            </select>
          </Field>
          <Button onClick={createTicket}>Create ticket</Button>
        </Card>

        <Card className="p-5 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl">Customer 360</h2>
            {selected ? <Badge status={selected.kyc} /> : null}
          </div>
          {selected ? (
            <>
              <p className="mt-2 text-sm text-mute">
                {selected.name} · {selected.phone} · {selected.occupation} · {selected.county}
              </p>
              <p className="mt-1 text-xs text-mute">
                CLV {money(selected.clv)} · risk {selected.riskScore} · channel {selected.channel}
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
                <div className="rounded-xl border border-line p-3">
                  <p className="text-mute">Policies</p>
                  <p className="font-medium">{history.policies.length}</p>
                  <ul className="mt-2 space-y-1 text-xs text-mute">
                    {history.policies.slice(0, 3).map((p) => (
                      <li key={p.id}>
                        <Link className="text-teal" href={`/app/policies/${p.id}`}>
                          {p.number}
                        </Link>{" "}
                        · {p.status}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-line p-3">
                  <p className="text-mute">Claims</p>
                  <p className="font-medium">{history.claims.length}</p>
                  <ul className="mt-2 space-y-1 text-xs text-mute">
                    {history.claims.slice(0, 3).map((c) => (
                      <li key={c.id}>
                        <Link className="text-teal" href={`/app/claims/${c.id}`}>
                          {c.number}
                        </Link>{" "}
                        · {c.status}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-line p-3">
                  <p className="text-mute">Quotes</p>
                  <p className="font-medium">{history.quotes.length}</p>
                  <ul className="mt-2 space-y-1 text-xs text-mute">
                    {history.quotes.slice(0, 3).map((q) => (
                      <li key={q.id}>
                        <Link className="text-teal" href={`/app/quotes/${q.id}`}>
                          {q.number}
                        </Link>{" "}
                        · {q.status}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : null}
        </Card>
      </div>

      <Card className="mt-4 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
          <h2 className="font-display text-xl">Tickets</h2>
          <div className="flex gap-1">
            {(["open", "pending", "resolved", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-lg px-2.5 py-1 text-xs capitalize ${
                  filter === f ? "bg-teal text-on-accent" : "border border-line text-mute hover:border-teal"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <Table headers={["Subject", "Channel", "Participant", "Linked", "Priority", "Status", "Actions"]}>
          {visible.map((t) => (
            <tr key={t.id} className="border-b border-line/70">
              <td className="px-3 py-3">
                <p className="font-medium">{t.subject}</p>
                {t.notes ? <p className="text-xs text-mute">{t.notes}</p> : null}
                {t.assignee ? <p className="text-xs text-mute">Assignee {t.assignee}</p> : null}
              </td>
              <td className="px-3 py-3 capitalize">{t.channel}</td>
              <td className="px-3 py-3">
                <button
                  type="button"
                  className="text-left text-teal hover:underline"
                  onClick={() => {
                    const match = participants.find((p) => p.name === t.participantName || p.id === t.participantId);
                    if (match) setSelectedId(match.id);
                  }}
                >
                  {t.participantName}
                </button>
              </td>
              <td className="px-3 py-3 text-xs">
                {t.claimId ? (
                  <Link className="text-teal" href={`/app/claims/${t.claimId}`}>
                    Claim
                  </Link>
                ) : null}
                {t.claimId && t.policyId ? " · " : null}
                {t.policyId ? (
                  <Link className="text-teal" href={`/app/policies/${t.policyId}`}>
                    Policy
                  </Link>
                ) : null}
                {!t.claimId && !t.policyId ? <span className="text-mute">—</span> : null}
              </td>
              <td className="px-3 py-3">
                <Badge status={t.priority === "high" ? "fraud_check" : t.priority} />
              </td>
              <td className="px-3 py-3">
                <Badge status={t.status} />
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1">
                  {t.status === "open" ? (
                    <Button
                      variant="ghost"
                      className="!px-2 !py-1 text-xs"
                      onClick={() => platformStore.updateTicket(t.id, { status: "pending", assignee: user?.name })}
                    >
                      Pending
                    </Button>
                  ) : null}
                  {t.status !== "resolved" ? (
                    <Button
                      variant="ghost"
                      className="!px-2 !py-1 text-xs"
                      onClick={() => {
                        platformStore.updateTicket(t.id, { status: "resolved", assignee: user?.name });
                        pushNotification({
                          channel: t.channel === "whatsapp" ? "whatsapp" : t.channel === "sms" ? "sms" : "email",
                          title: "Ticket resolved",
                          body: `${t.subject} closed for ${t.participantName}.`,
                        });
                      }}
                    >
                      Resolve
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      className="!px-2 !py-1 text-xs"
                      onClick={() => platformStore.updateTicket(t.id, { status: "open" })}
                    >
                      Reopen
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
        {visible.length === 0 ? <p className="p-6 text-sm text-mute">No tickets in this filter.</p> : null}
      </Card>
    </div>
  );
}
