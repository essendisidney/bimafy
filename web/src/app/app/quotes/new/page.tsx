"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { priceQuote, quoteStatusFromUw } from "@/lib/engines/quote";
import { pushNotification } from "@/lib/events/ledger";
import { useAuth } from "@/lib/auth";
import { persistQuote, useParticipants, useProducts } from "@/lib/data";
import { money } from "@/lib/format";
import { updateLead, useLeads } from "@/lib/leads";
import type { Frequency } from "@/lib/types";
import { Badge, Button, Card, DetailSkeleton, Field, PageHeader, inputClass } from "@/components/ui";

function digits(phone: string) {
  return phone.replace(/\D/g, "");
}

function NewQuoteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, operatorId } = useAuth();
  const { products } = useProducts();
  const { participants } = useParticipants();
  const { leads } = useLeads();
  const preset = params.get("product");
  const leadId = params.get("lead");
  const lead = leadId ? leads.find((l) => l.id === leadId) : undefined;
  // Explicit picks; empty means "use the default worked out below".
  const [productId, setProductId] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // A CRB result belongs to the client it was run for, so switching clients hides it.
  const [crb, setCrb] = useState<{ participantId: string; score?: number; band?: string; error?: string } | null>(null);
  const [crbBusy, setCrbBusy] = useState(false);

  // Defaults: a lead's phone/line wins, then the URL preset / signed-in participant, then the first option.
  const leadParticipantId = lead ? participants.find((p) => digits(p.phone) === digits(lead.phone))?.id : undefined;
  const leadProductId = lead ? products.find((p) => p.line === lead.productLine)?.id : undefined;
  const resolvedProductId =
    productId || leadProductId || products.find((p) => p.slug === preset)?.id || products[0]?.id || "";
  const resolvedParticipantId = participantId || leadParticipantId || user?.participantId || participants[0]?.id || "";
  const crbHere = crb?.participantId === resolvedParticipantId ? crb : null;
  const creditScore = crbHere?.score;
  const crbBand = crbHere?.band ?? null;
  const crbError = crbHere?.error ?? null;
  const [sumCovered, setSumCovered] = useState(500000);
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [age, setAge] = useState(32);
  const [vehicleAge, setVehicleAge] = useState(6);
  const [medicalCondition, setMedicalCondition] = useState("");
  const [claimsLast3Years, setClaimsLast3Years] = useState(0);

  const product = products.find((p) => p.id === resolvedProductId) ?? products[0];
  const participant = participants.find((p) => p.id === resolvedParticipantId) ?? participants[0];
  const quoteName = lead?.name ?? participant?.name ?? "Participant";

  const priced = useMemo(() => {
    if (!product || !participant) return null;
    return priceQuote({
      product,
      participantId: resolvedParticipantId,
      participantName: quoteName,
      sumCovered,
      frequency,
      channel: user?.role === "agent" ? "agent" : user?.role === "broker" ? "broker" : "web",
      agentId: user?.agentId,
      brokerId: user?.brokerId,
      risk: {
        age,
        vehicleAge,
        medicalCondition,
        claimsLast3Years,
        ...(typeof creditScore === "number" ? { creditScore } : {}),
        ...(lead ? { leadId: lead.id, leadPhone: lead.phone } : {}),
      },
    });
  }, [
    product,
    resolvedParticipantId,
    participant,
    quoteName,
    sumCovered,
    frequency,
    user,
    age,
    vehicleAge,
    medicalCondition,
    claimsLast3Years,
    creditScore,
    lead,
  ]);

  async function runCrb() {
    if (!participant) return;
    const forParticipant = participant.id;
    setCrbBusy(true);
    setCrb(null);
    try {
      const res = await fetch("/api/partners/crb/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idNumber: participant.nationalId,
          fullName: participant.name,
          phone: participant.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "CRB failed");
      setCrb({
        participantId: forParticipant,
        score: data.score as number,
        band: `${data.band} · UW ${data.uwHint}${data.loadPercent ? ` (+${data.loadPercent}%)` : ""}`,
      });
    } catch (e) {
      setCrb({ participantId: forParticipant, error: e instanceof Error ? e.message : "CRB failed" });
    } finally {
      setCrbBusy(false);
    }
  }

  if (!product || !participant || !priced) {
    return <DetailSkeleton label="Loading quote desk" />;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Quotation engine"
        title="Price a cover"
        description="Rules engine + takaful split + optional CRB score for underwriting."
      />
      {lead ? (
        <p className="mb-4 rounded-xl border border-line bg-sand/50 px-4 py-3 text-sm">
          Quoting lead <span className="font-medium text-ink">{lead.name}</span> · {lead.phone} ·{" "}
          {lead.productLine.replaceAll("_", " ")}
          {lead.notes ? <span className="text-mute"> · {lead.notes}</span> : null}
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="space-y-4 p-5 lg:col-span-3">
          <Field label="Product">
            <select className={inputClass} value={resolvedProductId} onChange={(e) => setProductId(e.target.value)}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Participant">
            <select className={inputClass} value={resolvedParticipantId} onChange={(e) => setParticipantId(e.target.value)}>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.county}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Sum covered (KES)">
              <input
                className={inputClass}
                type="number"
                value={sumCovered}
                onChange={(e) => setSumCovered(Number(e.target.value))}
              />
            </Field>
            <Field label="Frequency">
              <select
                className={inputClass}
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
              >
                {product.frequencies.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Age">
              <input className={inputClass} type="number" value={age} onChange={(e) => setAge(Number(e.target.value))} />
            </Field>
            <Field label="Vehicle age (motor)">
              <input
                className={inputClass}
                type="number"
                value={vehicleAge}
                onChange={(e) => setVehicleAge(Number(e.target.value))}
              />
            </Field>
            <Field label="Medical condition">
              <input
                className={inputClass}
                value={medicalCondition}
                onChange={(e) => setMedicalCondition(e.target.value)}
                placeholder="e.g. Diabetes"
              />
            </Field>
            <Field label="Claims in last 3 years">
              <input
                className={inputClass}
                type="number"
                value={claimsLast3Years}
                onChange={(e) => setClaimsLast3Years(Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="rounded-xl border border-line bg-sand/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink">CRB credit check</p>
                <p className="text-xs text-mute">
                  {typeof creditScore === "number"
                    ? `Score ${creditScore}${crbBand ? ` · ${crbBand}` : ""}`
                    : "Optional — feeds underwriting load / refer / reject"}
                </p>
              </div>
              <Button variant="secondary" disabled={crbBusy} onClick={runCrb}>
                {crbBusy ? "Checking…" : "Run CRB"}
              </Button>
            </div>
            {crbError ? <p className="mt-2 text-sm text-danger">{crbError}</p> : null}
            {typeof creditScore === "number" ? <Badge status={priced.uwDecision} /> : null}
          </div>
          {saveError ? <p className="text-sm text-danger">{saveError}</p> : null}
          <Button
            onClick={async () => {
              setSaving(true);
              setSaveError(null);
              try {
                const id = crypto.randomUUID();
                const number = `QT-2026-${Math.floor(10000 + Math.random() * 89999)}`;
                const status = quoteStatusFromUw(priced.uwDecision);
                const opId =
                  operatorId ?? process.env.NEXT_PUBLIC_OPERATOR_ID ?? "00000000-0000-4000-8000-000000000001";
                await persistQuote(
                  {
                    ...priced,
                    id,
                    number,
                    status,
                    createdAt: new Date().toISOString(),
                    validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
                  },
                  opId,
                );
                pushNotification({
                  channel: "email",
                  title: "Quotation ready",
                  body: `${number} for ${quoteName} · ${money(priced.total)} · UW ${priced.uwDecision}`,
                });
                if (lead) {
                  await updateLead(lead.id, { status: "quoted" });
                }
                router.push(`/app/quotes/${id}`);
              } catch (err) {
                setSaveError(err instanceof Error ? err.message : "Could not save quote");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save quotation"}
          </Button>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <p className="text-xs uppercase tracking-wide text-teal">Live price</p>
          <p className="mt-2 font-display text-4xl">{money(priced.total)}</p>
          <p className="text-sm text-mute">
            per {frequency} · ~{money(priced.monthly)} monthly equivalent
          </p>
          <dl className="mt-5 space-y-2 text-sm">
            <Line k="Base contribution" v={money(priced.base)} />
            <Line k="Wakala operator fee" v={money(priced.wakala)} />
            <Line k="Tabarru (risk fund)" v={money(priced.tabarru)} />
            <Line k="Taxes" v={money(priced.taxes)} />
            <Line k="Levies (training, PHCF, stamp)" v={money(priced.levies)} />
          </dl>
          <div className="mt-5 rounded-xl bg-sand p-3 text-sm">
            <p className="font-medium capitalize">Underwriting: {priced.uwDecision.replaceAll("_", " ")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-mute">
              {priced.uwNotesList.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-mute">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

export default function NewQuotePage() {
  return (
    <Suspense fallback={<DetailSkeleton label="Loading quote desk" />}>
      <NewQuoteForm />
    </Suspense>
  );
}
