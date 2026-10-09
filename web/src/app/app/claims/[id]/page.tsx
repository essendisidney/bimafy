"use client";

import { SearchX } from "lucide-react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { updateClaimRemote, useClaimsBook } from "@/lib/data";
import { pushNotification, recordClaimPayout } from "@/lib/events/ledger";
import { money } from "@/lib/format";
import { demoUsers } from "@/lib/seed";
import { platformStore, usePlatform } from "@/lib/store";
import type { Claim, ClaimStatus, UserRole } from "@/lib/types";
import { Badge, Button, Card, DetailSkeleton, Empty, Field, PageHeader, inputClass } from "@/components/ui";
import { useState } from "react";
import Link from "next/link";

const steps: ClaimStatus[] = [
  "reported",
  "documents_pending",
  "under_review",
  "fraud_check",
  "assigned",
  "assessing",
  "estimated",
  "pending_approval",
  "approved",
  "paid",
  "closed",
];

const assessors = demoUsers.filter((u) => u.role === "claims_assessor");

function canOfficer(role: UserRole) {
  return role === "claims_officer" || role === "admin" || role === "branch_manager";
}

function canAssessor(role: UserRole) {
  return role === "claims_assessor" || role === "claims_officer" || role === "admin";
}

export default function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { claims, loading, refresh } = useClaimsBook();
  const { documents } = usePlatform();
  const claim = claims.find((c) => c.id === id);
  const [assessorName, setAssessorName] = useState(assessors[0]?.name ?? "James Omondi");
  const [estimate, setEstimate] = useState(0);
  const [evidenceName, setEvidenceName] = useState("additional_evidence.txt");
  const [evidenceNote, setEvidenceNote] = useState("");

  if (loading) return <DetailSkeleton label="Loading claim" />;
  if (!claim) return (
      <Card>
        <Empty
          icon={SearchX}
          title="Claim not found"
          hint="Check the claim number, or search for it with ⌘K."
          action={<Button href="/app/claims" variant="secondary">All claims</Button>}
        />
      </Card>
    );

  const role = user?.role ?? "participant";
  const isMine =
    role !== "claims_assessor" || !claim.assessor || claim.assessor === user?.name;
  const estimateValue = estimate || Math.round(claim.claimed * 0.85);
  const evidence = documents.filter((d) => d.claimId === claim.id);

  async function patch(next: Partial<Claim>) {
    await updateClaimRemote(claim!.id, next);
    refresh();
  }

  function attachEvidence() {
    if (!evidenceName.trim() || !claim) return;
    platformStore.addDocument({
      id: `doc-${crypto.randomUUID().slice(0, 8)}`,
      owner: claim.number,
      type: "Evidence",
      name: evidenceName.trim(),
      createdAt: new Date().toISOString(),
      policyId: claim.policyId,
      claimId: claim.id,
      participantId: claim.participantId,
      mime: "text/plain",
      body: evidenceNote.trim() || `Evidence for ${claim.number}`,
    });
    pushNotification({
      channel: "email",
      title: "Evidence uploaded",
      body: `${evidenceName} attached to ${claim.number}.`,
      href: `/app/claims/${claim.id}`,
    });
    if (claim.status === "documents_pending") {
      void patch({ status: "under_review" });
    }
    setEvidenceNote("");
    setEvidenceName("additional_evidence.txt");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Claim workflow"
        title={claim.number}
        description={`${claim.policyNumber} · ${claim.participantName}`}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-wrap gap-2">
            <Badge status={claim.status} />
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs ${
                claim.fraudScore >= 60 ? "bg-danger/10 text-danger" : "bg-teal/10 text-teal-ink"
              }`}
            >
              Fraud score {claim.fraudScore}
            </span>
          </div>
          <p className="mt-4 text-sm">{claim.description}</p>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-mute">Incident</dt>
              <dd>{claim.incidentDate}</dd>
            </div>
            <div>
              <dt className="text-mute">Location</dt>
              <dd>{claim.location}</dd>
            </div>
            <div>
              <dt className="text-mute">Claimed</dt>
              <dd>{money(claim.claimed)}</dd>
            </div>
            <div>
              <dt className="text-mute">Approved</dt>
              <dd>{claim.approved ? money(claim.approved) : "—"}</dd>
            </div>
            <div>
              <dt className="text-mute">Assessor</dt>
              <dd>{claim.assessor ?? "Unassigned"}</dd>
            </div>
            <div>
              <dt className="text-mute">SLA due</dt>
              <dd>{claim.slaDue?.slice(0, 16).replace("T", " ")}</dd>
            </div>
          </dl>

          {role === "participant" ? (
            <p className="mt-6 text-sm text-mute">You can track status here. Officers and assessors action the claim.</p>
          ) : !isMine ? (
            <p className="mt-6 text-sm text-mute">Assigned to {claim.assessor}. Switch to that assessor persona to action it.</p>
          ) : (
            <div className="mt-6 space-y-4">
              {canOfficer(role) ? (
                <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-sand/40 p-3">
                  <Field label="Assign assessor">
                    <select
                      className={inputClass}
                      value={assessorName}
                      onChange={(e) => setAssessorName(e.target.value)}
                    >
                      {assessors.map((a) => (
                        <option key={a.id} value={a.name}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await patch({ status: "assigned", assessor: assessorName });
                      pushNotification({
                        channel: "email",
                        title: "Claim assigned",
                        body: `${claim.number} assigned to ${assessorName}.`,
                        href: `/app/claims/${claim.id}`,
                      });
                      pushNotification({
                        channel: "sms",
                        title: "Assessor assigned",
                        body: `${claim.number}: ${assessorName} will assess your claim.`,
                        href: `/app/claims/${claim.id}`,
                      });
                    }}
                  >
                    Assign
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await patch({ status: "documents_pending" });
                      pushNotification({
                        channel: "sms",
                        title: "Documents requested",
                        body: `${claim.number}: please upload police abstract / photos via Documents or claim desk.`,
                        href: `/app/claims/${claim.id}`,
                      });
                    }}
                  >
                    Request documents
                  </Button>
                </div>
              ) : null}

              {canAssessor(role) ? (
                <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-sand/40 p-3">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      patch({
                        status: "assessing",
                        assessor: claim.assessor ?? user?.name,
                      })
                    }
                  >
                    Start assessment
                  </Button>
                  <Field label="Estimate (KES)">
                    <input
                      className={inputClass}
                      type="number"
                      value={estimate || estimateValue}
                      onChange={(e) => setEstimate(Number(e.target.value))}
                    />
                  </Field>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      patch({
                        status: "estimated",
                        approved: estimateValue,
                        assessor: claim.assessor ?? user?.name,
                      })
                    }
                  >
                    Post estimate
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => patch({ status: "pending_approval", approved: claim.approved ?? estimateValue })}
                  >
                    Submit for approval
                  </Button>
                </div>
              ) : null}

              {canOfficer(role) ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={async () => {
                      const approved = claim.approved ?? claim.claimed;
                      await patch({ status: "approved", approved });
                      pushNotification({
                        channel: "sms",
                        title: "Claim approved",
                        body: `${claim.number} approved for KES ${Math.round(approved).toLocaleString()}.`,
                        href: `/app/claims/${claim.id}`,
                      });
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      if (claim.status !== "paid") {
                        recordClaimPayout({
                          ...claim,
                          approved: claim.approved ?? claim.claimed,
                        });
                      }
                      await patch({
                        status: "paid",
                        approved: claim.approved ?? claim.claimed,
                      });
                    }}
                  >
                    Mark paid
                  </Button>
                  <Button variant="danger" onClick={() => patch({ status: "rejected" })}>
                    Reject
                  </Button>
                  <Button variant="ghost" onClick={() => patch({ status: "closed" })}>
                    Close
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-xl">Workflow</h2>
          <ol className="mt-4 space-y-2 text-sm">
            {steps.map((step) => (
              <li
                key={step}
                className={`rounded-xl px-3 py-2 ${step === claim.status ? "bg-forest text-champagne" : "bg-sand"}`}
              >
                {step.replaceAll("_", " ")}
              </li>
            ))}
          </ol>
          <h3 className="mt-6 text-sm font-medium">Evidence ({evidence.length})</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {evidence.length === 0 ? (
              <li className="text-mute">None yet</li>
            ) : (
              evidence.map((d) => (
                <li key={d.id} className="rounded-xl bg-sand px-3 py-2">
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-mute">{d.type} · {d.createdAt.slice(0, 10)}</p>
                </li>
              ))
            )}
          </ul>
          <div className="mt-3 space-y-2">
            <input
              className={inputClass}
              value={evidenceName}
              onChange={(e) => setEvidenceName(e.target.value)}
              placeholder="File name"
            />
            <textarea
              className={inputClass}
              rows={2}
              value={evidenceNote}
              onChange={(e) => setEvidenceNote(e.target.value)}
              placeholder="Notes"
            />
            <Button variant="secondary" onClick={attachEvidence}>
              Attach evidence
            </Button>
          </div>
          <Button href={`/app/documents?claim=${claim.id}`} variant="ghost" className="mt-3">
            Open documents desk
          </Button>
          <p className="mt-4 text-xs text-mute">
            Officer assigns → assessor estimates → officer approves / pays.{" "}
            <Link className="text-teal" href={`/app/policies/${claim.policyId}`}>
              View policy
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
