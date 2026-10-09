"use client";

import { useState } from "react";
import type { CrbCheckResult } from "@/lib/partners/crb";
import type { IprsVerifyResult } from "@/lib/partners/iprs";
import { mirrorV1Response } from "@/lib/partners/mirror_v1";
import type { NtsaLookupResult } from "@/lib/partners/ntsa";
import type { OcrDocumentType, OcrExtractResult } from "@/lib/partners/ocr";
import { pushNotification } from "@/lib/events/ledger";
import { platformStore, usePlatform } from "@/lib/store";
import { enqueueWebhook, retryWebhook } from "@/lib/webhooks";
import { Badge, Button, Card, Field, PageHeader, inputClass } from "@/components/ui";

const partners = [
  ["Mobile money", "M-Pesa Daraja, Airtel Money"],
  ["Payments", "Flutterwave, Paystack, Cellulant, Stripe"],
  ["Identity", "IPRS / eCitizen national ID + biometrics"],
  ["Government", "NTSA vehicle registry, police e-abstract"],
  ["Documents", "OCR on IDs, logbooks, abstracts, medical notes"],
  ["Credit", "Metropol / TransUnion CRB — wired into UW"],
  ["Distribution API", "Versioned /api/v1 for banks, SACCOs, ride-hailing"],
];

export default function IntegrationsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Bimafy Connect"
        title="APIs & embedded insurance"
        description="Verify identity, credit, vehicles and documents before binding risk. Embed cover via /api/v1 and receive webhooks on bind, FNOL, and payment."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <IprsPanel />
        <CrbPanel />
        <NtsaPanel />
        <OcrPanel />
      </div>

      <ApiPlayground />
      <WebhookInbox />

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {partners.map(([title, copy]) => (
          <Card key={title} className="p-5">
            <h2 className="font-display text-xl">{title}</h2>
            <p className="mt-2 text-sm text-mute">{copy}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-4 space-y-2 overflow-x-auto p-5 text-sm text-mute">
        <p className="font-medium text-heading">Partner endpoints</p>
        <pre className="text-xs text-ink">{`POST /api/partners/iprs/verify
POST /api/partners/crb/check
POST /api/partners/ntsa/vehicle
POST /api/partners/ocr/extract
GET  /api/v1/products
POST /api/v1/quotes
POST /api/v1/policies
POST /api/v1/claims`}</pre>
      </Card>
    </div>
  );
}

function CrbPanel() {
  const [idNumber, setIdNumber] = useState("29876543");
  const [fullName, setFullName] = useState("Joseph Otieno");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CrbCheckResult | null>(null);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/partners/crb/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idNumber, fullName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "CRB failed");
      setResult(data as CrbCheckResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CRB failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line bg-[#1a2f4a] px-5 py-4 text-champagne">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Credit</p>
        <p className="mt-1 font-display text-2xl text-white">CRB check</p>
      </div>
      <div className="space-y-3 p-5">
        <Field label="National ID">
          <input className={inputClass} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
        </Field>
        <Field label="Full name">
          <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Button disabled={loading} onClick={run}>
          {loading ? "Checking…" : "Run CRB enquiry"}
        </Button>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {result ? (
          <div className="space-y-2 rounded-xl border border-line bg-sand/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <Badge status={result.uwHint === "accept" ? "verified" : result.uwHint === "reject" ? "rejected" : "pending"} />
              <span className="text-xs text-mute">{result.mode}</span>
            </div>
            <p className="font-medium text-ink">
              Score {result.score} · {result.band}
            </p>
            <p className="text-mute">
              UW hint: {result.uwHint}
              {result.loadPercent ? ` (+${result.loadPercent}%)` : ""} · delinquencies {result.delinquencies24m}
            </p>
            <ul className="space-y-1 text-xs text-mute">
              {result.facilities.map((f) => (
                <li key={`${f.lender}-${f.product}`}>
                  {f.lender} · {f.product} · KES {f.outstanding.toLocaleString()} · {f.status}
                </li>
              ))}
            </ul>
            <p className="text-xs text-mute">{result.notes.join(" ")} · {result.reference}</p>
            <p className="text-xs text-teal">Pass risk.creditScore into quotes to drive STP / load / refer.</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function ApiPlayground() {
  const [apiKey, setApiKey] = useState("bimafy_pk_demo");
  const [log, setLog] = useState("Ready. Demo key: bimafy_pk_demo");
  const [busy, setBusy] = useState(false);
  const [lastQuote, setLastQuote] = useState("");
  const [lastPolicy, setLastPolicy] = useState("");

  async function call(method: string, path: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      setLog(JSON.stringify({ status: res.status, data }, null, 2));
      if (res.ok) {
        mirrorV1Response(data);
        if (data.quote || data.policy || data.claim) {
          setLog(
            JSON.stringify(
              {
                status: res.status,
                mirrored: true,
                hint: "Also written to Quotes / Policies / Claims desks",
                data,
              },
              null,
              2,
            ),
          );
        }
      }
      if (data.quote?.number) setLastQuote(data.quote.number);
      if (data.quote?.id) setLastQuote(data.quote.id);
      if (data.policy?.number) setLastPolicy(data.policy.number);
    } catch (e) {
      setLog(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 overflow-hidden">
      <div className="border-b border-line bg-forest px-5 py-4 text-champagne">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Distribution</p>
        <p className="mt-1 font-display text-2xl text-white">Partner API /v1</p>
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="API key">
            <input className={inputClass} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} variant="secondary" onClick={() => call("GET", "/api/v1/products")}>
              List products
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                call("POST", "/api/v1/quotes", {
                  productSlug: "boda-micro",
                  participantName: "Embedded Rider",
                  sumCovered: 250000,
                  frequency: "weekly",
                  risk: { creditScore: 680 },
                })
              }
            >
              Create quote
            </Button>
            <Button
              disabled={busy || !lastQuote}
              variant="secondary"
              onClick={() => call("POST", "/api/v1/policies", { quoteId: lastQuote })}
            >
              Bind policy
            </Button>
            <Button
              disabled={busy || !lastPolicy}
              variant="ghost"
              onClick={() =>
                call("POST", "/api/v1/claims", {
                  policyNumber: lastPolicy,
                  description: "Partner-reported incident via embed",
                  claimed: 15000,
                  location: "Nairobi",
                })
              }
            >
              File claim
            </Button>
          </div>
          <p className="text-xs text-mute">
            Keys: <code className="text-ink">bimafy_pk_demo</code>, <code className="text-ink">bimafy_pk_sacco</code>,{" "}
            <code className="text-ink">bimafy_pk_ride</code>. Add more via <code className="text-ink">PARTNER_API_KEYS</code>.
          </p>
        </div>
        <pre className="max-h-80 overflow-auto rounded-xl border border-line bg-sand/50 p-3 text-xs text-ink whitespace-pre-wrap">
          {log}
        </pre>
      </div>
    </Card>
  );
}

function IprsPanel() {
  const [idNumber, setIdNumber] = useState("29876543");
  const [firstName, setFirstName] = useState("Joseph");
  const [lastName, setLastName] = useState("Otieno");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IprsVerifyResult | null>(null);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/partners/iprs/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idNumber, firstName, lastName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "IPRS failed");
      setResult(data as IprsVerifyResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "IPRS failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line bg-forest px-5 py-4 text-champagne">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Identity</p>
        <p className="mt-1 font-display text-2xl text-white">IPRS verify</p>
      </div>
      <div className="space-y-3 p-5">
        <Field label="National ID">
          <input className={inputClass} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="First name">
            <input className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name">
            <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <Button disabled={loading} onClick={run}>
          {loading ? "Verifying…" : "Verify ID"}
        </Button>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {result ? (
          <div className="space-y-2 rounded-xl border border-line bg-sand/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <Badge status={result.matched ? "verified" : "rejected"} />
              <span className="text-xs text-mute">{result.mode}</span>
            </div>
            {result.person ? (
              <>
                <p className="font-medium text-ink">{result.person.fullName}</p>
                <p className="text-mute">
                  {result.person.idNumber} · {result.person.gender} · {result.person.county} · {result.person.status}
                </p>
                <p className="text-xs text-mute">Confidence {(result.confidence * 100).toFixed(0)}% · {result.reference}</p>
              </>
            ) : (
              <p className="text-mute">No registry match.</p>
            )}
            <ul className="space-y-1 text-xs text-mute">
              {result.checks.map((c) => (
                <li key={c.code}>
                  {c.ok ? "✓" : "✗"} {c.code}: {c.detail}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function NtsaPanel() {
  const [reg, setReg] = useState("KDA123A");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NtsaLookupResult | null>(null);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/partners/ntsa/vehicle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationNumber: reg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "NTSA failed");
      setResult(data as NtsaLookupResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "NTSA failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line bg-[#0a3d3a] px-5 py-4 text-champagne">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Motor</p>
        <p className="mt-1 font-display text-2xl text-white">NTSA lookup</p>
      </div>
      <div className="space-y-3 p-5">
        <Field label="Registration">
          <input className={inputClass} value={reg} onChange={(e) => setReg(e.target.value.toUpperCase())} />
        </Field>
        <Button disabled={loading} onClick={run}>
          {loading ? "Looking up…" : "Lookup vehicle"}
        </Button>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {result ? (
          <div className="space-y-2 rounded-xl border border-line bg-sand/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <Badge status={result.found ? (result.riskFlags.length ? "pending" : "active") : "rejected"} />
              <span className="text-xs text-mute">{result.mode}</span>
            </div>
            {result.vehicle ? (
              <>
                <p className="font-medium text-ink">
                  {result.vehicle.make} {result.vehicle.model} · {result.vehicle.registrationNumber}
                </p>
                <p className="text-mute">
                  {result.vehicle.year} · {result.vehicle.colour} · {result.vehicle.logbookStatus}
                </p>
                <p className="text-xs text-mute">
                  Owner {result.vehicle.ownerName} · Chassis {result.vehicle.chassisNumber}
                </p>
                <p className="text-xs text-mute">{result.reference}</p>
              </>
            ) : (
              <p className="text-mute">Vehicle not found.</p>
            )}
            {result.riskFlags.length ? (
              <ul className="space-y-1 text-xs text-gold-ink">
                {result.riskFlags.map((f) => (
                  <li key={f}>⚠ {f}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function OcrPanel() {
  const [documentType, setDocumentType] = useState<OcrDocumentType>("police_abstract");
  const [fileName, setFileName] = useState("abstract_githurai.pdf");
  const [textSample, setTextSample] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OcrExtractResult | null>(null);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/partners/ocr/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType,
          fileName,
          textSample: textSample.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "OCR failed");
      setResult(data as OcrExtractResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "OCR failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line bg-navy px-5 py-4 text-champagne">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Documents</p>
        <p className="mt-1 font-display text-2xl text-white">OCR extract</p>
      </div>
      <div className="space-y-3 p-5">
        <Field label="Document type">
          <select
            className={inputClass}
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as OcrDocumentType)}
          >
            <option value="national_id">National ID</option>
            <option value="logbook">Logbook</option>
            <option value="police_abstract">Police abstract</option>
            <option value="medical_report">Medical report</option>
            <option value="kra_pin">KRA PIN</option>
            <option value="unknown">Auto-detect</option>
          </select>
        </Field>
        <Field label="File name">
          <input className={inputClass} value={fileName} onChange={(e) => setFileName(e.target.value)} />
        </Field>
        <Field label="Paste text (optional)">
          <textarea
            className={inputClass}
            rows={3}
            value={textSample}
            onChange={(e) => setTextSample(e.target.value)}
            placeholder="Paste abstract / ID text to extract fields"
          />
        </Field>
        <Button disabled={loading} onClick={run}>
          {loading ? "Extracting…" : "Run OCR"}
        </Button>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {result ? (
          <div className="space-y-2 rounded-xl border border-line bg-sand/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <Badge status={result.qualityScore >= 0.85 ? "verified" : "pending"} />
              <span className="text-xs text-mute">{result.mode}</span>
            </div>
            <p className="text-xs text-mute">
              {result.documentType} · quality {(result.qualityScore * 100).toFixed(0)}% · {result.reference}
            </p>
            <ul className="space-y-1">
              {result.fields.map((f) => (
                <li key={f.key} className="flex justify-between gap-2 text-xs">
                  <span className="text-mute">{f.key}</span>
                  <span className="font-medium text-ink">
                    {f.value}{" "}
                    <span className="font-normal text-mute">({(f.confidence * 100).toFixed(0)}%)</span>
                  </span>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              className="!text-xs"
              onClick={() => {
                const ocrText = result.fields.map((f) => `${f.key}: ${f.value}`).join("\n");
                platformStore.addDocument({
                  id: `doc-${crypto.randomUUID().slice(0, 8)}`,
                  owner: "OCR intake",
                  type: result.documentType.replaceAll("_", " "),
                  name: fileName || `${result.documentType}.txt`,
                  createdAt: new Date().toISOString(),
                  mime: "text/plain",
                  body: ocrText,
                  ocrText,
                });
                pushNotification({
                  channel: "email",
                  title: "OCR saved to Documents",
                  body: `${fileName} · ${result.documentType} filed in Documents desk.`,
                });
              }}
            >
              Save to Documents
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function WebhookInbox() {
  const { webhooks } = usePlatform();

  return (
    <Card className="mt-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">Webhooks</p>
          <h2 className="mt-1 font-display text-2xl">Partner event log</h2>
          <p className="mt-1 text-sm text-mute">
            policy.bound, claim.reported, claim.paid, and payment.completed fire into the partner URL.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => enqueueWebhook("connect.ping", { ok: true, source: "bimafy-connect" })}
        >
          Send test event
        </Button>
      </div>
      <div className="mt-4 space-y-2">
        {webhooks.length === 0 ? (
          <p className="text-sm text-mute">No deliveries yet. Bind a policy, file a claim, or send a test ping.</p>
        ) : null}
        {webhooks.slice(0, 12).map((w) => (
          <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
            <div>
              <p className="font-medium">{w.event}</p>
              <p className="text-xs text-mute">
                {w.url} · {w.createdAt.slice(0, 19).replace("T", " ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge status={w.status} />
              {w.status === "failed" ? (
                <Button variant="ghost" onClick={() => retryWebhook(w.id)}>
                  Retry
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
