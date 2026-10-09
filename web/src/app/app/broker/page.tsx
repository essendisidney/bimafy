"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { brokers, participants } from "@/lib/seed";
import { useAuth } from "@/lib/auth";
import { withdrawCommission } from "@/lib/events/ledger";
import { money, pct } from "@/lib/format";
import { createLeads, distributorKey, newLeadId, ownsLead, updateLead, useLeads } from "@/lib/leads";
import { usePlatform } from "@/lib/store";
import type { Lead, ProductLine } from "@/lib/types";
import { Badge, Button, Card, Field, PageHeader, Stat, Table, inputClass } from "@/components/ui";

const LINE_MAP: Record<string, ProductLine> = {
  motor: "motor",
  medical: "medical",
  micro: "micro",
  family: "family_takaful",
  family_takaful: "family_takaful",
  travel: "travel",
  agriculture: "agriculture",
  crop: "agriculture",
  gadget: "gadget",
};

export default function BrokerPage() {
  const { user, operatorId } = useAuth();
  const { quotes, policies, balanceDeltas } = usePlatform();
  const { leads, error: leadsError, mode } = useLeads();
  const broker = brokers.find((b) => b.id === user?.brokerId || b.dbId === user?.brokerId) ?? brokers[0];
  const leadOwner = mode === "supabase" && user?.brokerId ? user.brokerId : distributorKey(broker);
  const delta = balanceDeltas[broker.id] ?? { wallet: 0, gwp: 0 };
  const liveWallet = broker.wallet + delta.wallet;
  const myLeads = leads.filter((l) => l.brokerId === leadOwner || ownsLead(broker, l.brokerId));
  const myPolicies = policies.filter((p) => p.brokerId === broker.id || (p.channel === "broker" && !p.brokerId));
  const myQuotes = quotes.filter((q) => q.brokerId === broker.id || q.channel === "broker");
  const bookGwp = myPolicies.reduce((s, p) => s + p.contribution, 0) + delta.gwp;
  const accruedCommission = Math.round(bookGwp * broker.commissionRate);
  const renewals = myPolicies.filter((p) => {
    const days = (new Date(p.expiry).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 60;
  });

  const [csv, setCsv] = useState(
    "name,phone,productLine,notes\nAcme Fleet,254711000001,motor,8 vans\nKilifi Teachers SACCO,254722000002,medical,90 members",
  );
  const [importMsg, setImportMsg] = useState("");

  const clientIds = useMemo(() => {
    const ids = new Set(myPolicies.map((p) => p.participantId));
    myQuotes.forEach((q) => ids.add(q.participantId));
    return ids;
  }, [myPolicies, myQuotes]);

  const clients = participants.filter((p) => clientIds.has(p.id));

  async function importCsv() {
    const lines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      setImportMsg("Need a header row and at least one data row.");
      return;
    }
    const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const nameIdx = header.indexOf("name");
    const phoneIdx = header.indexOf("phone");
    const lineIdx = header.findIndex((h) => h === "productline" || h === "product" || h === "line");
    const notesIdx = header.indexOf("notes");
    if (nameIdx < 0 || phoneIdx < 0) {
      setImportMsg("CSV must include name and phone columns.");
      return;
    }

    const rows: Lead[] = [];
    for (const row of lines.slice(1)) {
      const cols = row.split(",").map((c) => c.trim());
      const name = cols[nameIdx];
      const phone = cols[phoneIdx];
      if (!name || !phone) continue;
      const rawLine = (lineIdx >= 0 ? cols[lineIdx] : "motor").toLowerCase();
      const productLine = LINE_MAP[rawLine] ?? "motor";
      const lead: Lead = {
        id: newLeadId(),
        name,
        phone: phone.startsWith("+") ? phone : `+${phone}`,
        productLine,
        status: "new",
        brokerId: leadOwner,
        notes: notesIdx >= 0 ? cols[notesIdx] ?? "Bulk import" : "Bulk import",
      };
      rows.push(lead);
    }
    const added = rows.length;
    if (added && !(await createLeads(rows, operatorId))) {
      setImportMsg("");
      return;
    }
    setImportMsg(`Imported ${added} schedule row${added === 1 ? "" : "s"} into broker leads.`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Broker portal"
        title={broker.name}
        description={`${broker.code} · ${broker.license} · Multi-client book, renewals, commissions and bulk schedule import.`}
        actions={<Button href="/app/quotes/new">New broker quote</Button>}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="YTD GWP (profile)" value={money(broker.ytdGwp)} />
        <Stat label="Book contribution" value={money(bookGwp)} hint={`${myPolicies.length} policies`} />
        <Stat
          label="Commission accrued"
          value={money(accruedCommission)}
          hint={`${pct(broker.commissionRate)} of book`}
        />
        <Stat label="Wallet" value={money(liveWallet)} hint={`${renewals.length} renewals ≤60d`} />
      </div>
      {liveWallet > 0 ? (
        <div className="mt-3">
          <Button
            variant="secondary"
            onClick={() =>
              withdrawCommission({
                distributorId: broker.id,
                name: broker.name,
                amount: Math.min(liveWallet, Math.round(liveWallet * 0.5) || liveWallet),
                kind: "broker",
              })
            }
          >
            Withdraw 50% wallet
          </Button>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card className="p-2">
          <h2 className="px-3 pt-3 font-display text-xl">Broker book</h2>
          <Table headers={["Policy", "Client", "Product", "Contribution", "Status"]}>
            {myPolicies.map((p) => (
              <tr key={p.id} className="border-b border-line/70">
                <td className="px-3 py-3">
                  <Link href={`/app/policies/${p.id}`} className="font-medium text-teal">
                    {p.number}
                  </Link>
                </td>
                <td className="px-3 py-3">{p.participantName}</td>
                <td className="px-3 py-3 text-sm">{p.productName}</td>
                <td className="px-3 py-3">{money(p.contribution)}</td>
                <td className="px-3 py-3">
                  <Badge status={p.status} />
                </td>
              </tr>
            ))}
          </Table>
          {myPolicies.length === 0 ? (
            <p className="p-6 text-sm text-mute">No broker-tagged policies yet. Convert a broker-channel quote.</p>
          ) : null}
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="font-display text-xl">Bulk schedule import</h2>
          {leadsError ? (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {leadsError}
            </p>
          ) : null}
          <p className="text-sm text-mute">
            Paste CSV for fleets or SACCO schedules. Creates broker leads (idempotent policy numbers come at bind time via{" "}
            <code className="text-ink">/api/v1</code>).
          </p>
          <Field label="CSV">
            <textarea className={inputClass} rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} />
          </Field>
          <Button onClick={importCsv}>Import rows</Button>
          {importMsg ? <p className="text-sm text-teal">{importMsg}</p> : null}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card className="p-2">
          <h2 className="px-3 pt-3 font-display text-xl">Pipeline leads</h2>
          <Table headers={["Name", "Line", "Status", ""]}>
            {myLeads.map((l) => (
              <tr key={l.id} className="border-b border-line/70">
                <td className="px-3 py-3">
                  {l.name}
                  <div className="text-xs text-mute">{l.phone}</div>
                  {l.notes ? <div className="text-xs text-mute">{l.notes}</div> : null}
                </td>
                <td className="px-3 py-3 capitalize">{l.productLine.replaceAll("_", " ")}</td>
                <td className="px-3 py-3">
                  <Badge status={l.status} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {l.status !== "won" && l.status !== "lost" ? (
                      <>
                        <Button
                          variant="ghost"
                          className="!px-2 !py-1 text-xs"
                          onClick={() => void updateLead(l.id, { status: "contacted" })}
                        >
                          Contact
                        </Button>
                        <Button
                          variant="ghost"
                          className="!px-2 !py-1 text-xs"
                          onClick={() => void updateLead(l.id, { status: "quoted" })}
                        >
                          Quoted
                        </Button>
                        <Button
                          variant="ghost"
                          className="!px-2 !py-1 text-xs"
                          onClick={() => void updateLead(l.id, { status: "won" })}
                        >
                          Won
                        </Button>
                      </>
                    ) : null}
                    <Button href={`/app/quotes/new?lead=${l.id}`} variant="secondary" className="!px-2 !py-1 text-xs">
                      Quote
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          {myLeads.length === 0 ? <p className="p-6 text-sm text-mute">Import a schedule or add leads via CSV.</p> : null}
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-xl">Clients & renewals</h2>
          <p className="mt-2 text-sm text-mute">
            {clients.length || broker.clients} clients in desk · {myQuotes.length} broker quotes
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {(clients.length ? clients : participants.slice(0, 4)).map((p) => (
              <li key={p.id} className="rounded-xl border border-line px-3 py-2">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-mute">
                  {p.county} · KYC {p.kyc} · {p.phone}
                </p>
              </li>
            ))}
          </ul>
          {renewals.length ? (
            <div className="mt-4 rounded-xl bg-sand/50 p-3 text-sm">
              <p className="font-medium text-ink">Upcoming renewals</p>
              <ul className="mt-2 space-y-1 text-mute">
                {renewals.map((p) => (
                  <li key={p.id}>
                    {p.number} · {p.participantName} · expires {p.expiry}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-xs text-mute">No renewals in the next 60 days on this broker book.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
