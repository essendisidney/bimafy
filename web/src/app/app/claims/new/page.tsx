"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { scoreClaim } from "@/lib/engines/fraud";
import { pushNotification, postJournal } from "@/lib/events/ledger";
import { useAuth } from "@/lib/auth";
import { persistClaim, useClaimsBook, usePoliciesBook } from "@/lib/data";
import { platformStore } from "@/lib/store";
import { Button, Card, DetailSkeleton, Field, PageHeader, inputClass } from "@/components/ui";

function NewClaimForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, operatorId } = useAuth();
  const { policies } = usePoliciesBook();
  const { claims } = useClaimsBook();
  const options = policies.filter((p) =>
    user?.role === "participant" ? p.participantId === user.participantId : true,
  );
  const presetPolicy = params.get("policy");
  const [policyId, setPolicyId] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [claimed, setClaimed] = useState(50000);
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().slice(0, 10));
  const [evidenceName, setEvidenceName] = useState("police_abstract.txt");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The ?policy= preset is only a default: an explicit pick always wins.
  const resolvedPolicyId =
    policyId || (presetPolicy && options.some((p) => p.id === presetPolicy) ? presetPolicy : options[0]?.id ?? "");

  return (
    <div>
      <PageHeader
        eyebrow="FNOL"
        title="Report a claim"
        description="Structured intake, optional evidence attach, and fraud scoring into the PAS book."
      />
      <Card className="max-w-2xl space-y-4 p-5">
        <Field label="Policy">
          <select className={inputClass} value={resolvedPolicyId} onChange={(e) => setPolicyId(e.target.value)}>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.number} · {p.productName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Incident date">
          <input
            className={inputClass}
            type="date"
            value={incidentDate}
            onChange={(e) => setIncidentDate(e.target.value)}
          />
        </Field>
        <Field label="Location / GPS description">
          <input
            className={inputClass}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Thika Superhighway, exit 7"
          />
        </Field>
        <Field label="Claimed amount (KES)">
          <input
            className={inputClass}
            type="number"
            value={claimed}
            onChange={(e) => setClaimed(Number(e.target.value))}
          />
        </Field>
        <Field label="What happened">
          <textarea
            className={inputClass}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="space-y-2 rounded-xl border border-line bg-sand/40 p-3">
          <p className="text-sm font-medium text-ink">Attach evidence (optional)</p>
          <Field label="File name">
            <input
              className={inputClass}
              value={evidenceName}
              onChange={(e) => setEvidenceName(e.target.value)}
            />
          </Field>
          <Field label="Notes / OCR text">
            <textarea
              className={inputClass}
              rows={2}
              value={evidenceNote}
              onChange={(e) => setEvidenceNote(e.target.value)}
              placeholder="Police abstract summary, photo captions…"
            />
          </Field>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button
          onClick={async () => {
            const policy = policies.find((p) => p.id === resolvedPolicyId);
            if (!policy) return;
            setSaving(true);
            setError(null);
            try {
              const fraud = scoreClaim(
                { claimed, incidentDate, reportedAt: new Date().toISOString(), location, policyId: resolvedPolicyId },
                policy,
                claims,
              );
              const id = crypto.randomUUID();
              const number = `CLM-2026-${Math.floor(Math.random() * 900 + 100)}`;
              const opId =
                operatorId ?? process.env.NEXT_PUBLIC_OPERATOR_ID ?? "00000000-0000-4000-8000-000000000001";
              await persistClaim(
                {
                  id,
                  number,
                  policyId: policy.id,
                  policyNumber: policy.number,
                  participantId: policy.participantId,
                  participantName: policy.participantName,
                  status: fraud.score >= 60 ? "fraud_check" : "under_review",
                  incidentDate,
                  reportedAt: new Date().toISOString(),
                  description,
                  location,
                  claimed,
                  fraudScore: fraud.score,
                  slaDue: new Date(Date.now() + 7 * 86400000).toISOString(),
                },
                opId,
              );
              if (evidenceName.trim()) {
                platformStore.addDocument({
                  id: `doc-${crypto.randomUUID().slice(0, 8)}`,
                  owner: number,
                  type: "Evidence",
                  name: evidenceName.trim(),
                  createdAt: new Date().toISOString(),
                  policyId: policy.id,
                  claimId: id,
                  participantId: policy.participantId,
                  mime: "text/plain",
                  body: evidenceNote.trim() || `FNOL evidence for ${number}`,
                });
              }
              pushNotification({
                channel: "sms",
                title: "Claim received",
                body: `FNOL logged for ${policy.number}. Fraud score ${fraud.score}.`,
                href: `/app/claims/${id}`,
              });
              postJournal({
                reference: `CLM-${id.slice(0, 6)}`,
                memo: `Claim reserve · ${policy.number}`,
                debit: claimed,
                credit: claimed,
              });
              router.push(`/app/claims/${id}`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not submit claim");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Submitting…" : "Submit claim"}
        </Button>
      </Card>
    </div>
  );
}

export default function NewClaimPage() {
  return (
    <Suspense fallback={<DetailSkeleton label="Loading claim form" />}>
      <NewClaimForm />
    </Suspense>
  );
}
