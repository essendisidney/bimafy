"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { buildPolicyCertificateHtml, downloadTextFile } from "@/lib/documents/certificate";
import { useClaimsBook, usePoliciesBook } from "@/lib/data";
import { platformStore, usePlatform } from "@/lib/store";
import type { DocumentItem } from "@/lib/types";
import { Badge, Button, Card, Field, PageHeader, Stat, Table, inputClass } from "@/components/ui";

function DocumentsDesk() {
  const { user } = useAuth();
  const params = useSearchParams();
  const claimParam = params.get("claim");
  const { documents } = usePlatform();
  const { policies } = usePoliciesBook();
  const { claims } = useClaimsBook();
  const [policyId, setPolicyId] = useState("");
  const [claimId, setClaimId] = useState(claimParam ?? "");
  const [uploadName, setUploadName] = useState("evidence_note.txt");
  const [uploadType, setUploadType] = useState("Evidence");
  const [uploadBody, setUploadBody] = useState("");
  const [filter, setFilter] = useState("all");
  const [ocrBusy, setOcrBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const visiblePolicies = useMemo(() => {
    if (user?.role === "participant") {
      return policies.filter((p) => p.participantId === user.participantId);
    }
    return policies;
  }, [policies, user]);

  const visibleClaims = useMemo(() => {
    if (user?.role === "participant") {
      return claims.filter((c) => c.participantId === user.participantId);
    }
    return claims;
  }, [claims, user]);

  const rows = useMemo(() => {
    let list = documents;
    if (user?.role === "participant" && user.participantId) {
      list = list.filter(
        (d) =>
          d.participantId === user.participantId ||
          visiblePolicies.some((p) => p.id === d.policyId || p.number === d.owner),
      );
    }
    if (claimParam) list = list.filter((d) => d.claimId === claimParam);
    if (filter !== "all") list = list.filter((d) => d.type.toLowerCase() === filter);
    return list;
  }, [documents, user, visiblePolicies, filter, claimParam]);

  const types = useMemo(() => {
    const set = new Set(documents.map((d) => d.type.toLowerCase()));
    return ["all", ...[...set].sort()];
  }, [documents]);

  const resolvedPolicyId = policyId || visiblePolicies[0]?.id || "";
  const linkedClaim = visibleClaims.find((c) => c.id === (claimId || claimParam));

  function issueCertificate() {
    const policy = policies.find((p) => p.id === resolvedPolicyId);
    if (!policy) return;
    const body = buildPolicyCertificateHtml(policy);
    const name = `${policy.number.replaceAll("/", "-")}_Certificate.html`;
    const doc: DocumentItem = {
      id: `doc-${crypto.randomUUID().slice(0, 8)}`,
      owner: policy.number,
      type: "Certificate",
      name,
      createdAt: new Date().toISOString(),
      policyId: policy.id,
      participantId: policy.participantId,
      mime: "text/html",
      body,
    };
    platformStore.addDocument(doc);
    downloadTextFile(name, body, "text/html");
    setMsg(`Certificate issued for ${policy.number}.`);
  }

  function uploadDoc() {
    if (!uploadName.trim()) return;
    const policy = policies.find((p) => p.id === resolvedPolicyId);
    const claim = linkedClaim ?? visibleClaims.find((c) => c.id === claimId);
    const doc: DocumentItem = {
      id: `doc-${crypto.randomUUID().slice(0, 8)}`,
      owner: claim?.number ?? policy?.number ?? user?.name ?? "desk",
      type: uploadType.trim() || "Evidence",
      name: uploadName.trim(),
      createdAt: new Date().toISOString(),
      participantId: claim?.participantId ?? policy?.participantId ?? user?.participantId,
      policyId: claim?.policyId ?? policy?.id,
      claimId: claim?.id,
      mime: "text/plain",
      body: uploadBody.trim() || undefined,
    };
    platformStore.addDocument(doc);
    setUploadBody("");
    setMsg(
      claim
        ? `Document linked to ${claim.number}.`
        : policy
          ? `Document linked to ${policy.number}.`
          : "Document saved to catalogue.",
    );
  }

  async function runOcr(doc: DocumentItem) {
    setOcrBusy(doc.id);
    try {
      const res = await fetch("/api/partners/ocr/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: doc.name,
          textSample: doc.body,
          documentType:
            doc.type.toLowerCase().includes("abstract")
              ? "police_abstract"
              : doc.type.toLowerCase().includes("kyc") || doc.name.toLowerCase().includes("id")
                ? "national_id"
                : "unknown",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "OCR failed");
      const fields = (data.fields as Array<{ key: string; value: string }> | undefined)
        ?.map((f) => `${f.key}: ${f.value}`)
        .join(" · ");
      platformStore.updateDocument(doc.id, {
        ocrText: fields || data.rawText?.slice(0, 200) || "No fields",
      });
      setMsg(`OCR complete for ${doc.name}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "OCR failed");
    } finally {
      setOcrBusy(null);
    }
  }

  function downloadDoc(doc: DocumentItem) {
    if (doc.body) {
      downloadTextFile(doc.name, doc.body, doc.mime ?? "text/plain");
      return;
    }
    if (doc.policyId) {
      const policy = policies.find((p) => p.id === doc.policyId);
      if (policy) {
        const body = buildPolicyCertificateHtml(policy);
        downloadTextFile(doc.name.endsWith(".html") ? doc.name : `${doc.name}.html`, body, "text/html");
        return;
      }
    }
    setMsg("No downloadable body for this demo asset (e.g. image placeholder).");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Document management"
        title="Policies, claims, KYC and contracts"
        description="Issue certificates, attach evidence to policies/claims, run OCR, and download from the live catalogue."
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Documents" value={String(rows.length)} />
        <Stat label="Certificates" value={String(documents.filter((d) => d.type === "Certificate").length)} />
        <Stat label="With OCR" value={String(documents.filter((d) => d.ocrText).length)} />
        <Stat label="Policies in scope" value={String(visiblePolicies.length)} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="font-display text-xl">Issue certificate</h2>
          <Field label="Policy">
            <select className={inputClass} value={resolvedPolicyId} onChange={(e) => setPolicyId(e.target.value)}>
              {visiblePolicies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number} · {p.productName}
                </option>
              ))}
            </select>
          </Field>
          <Button disabled={!resolvedPolicyId} onClick={issueCertificate}>
            Generate &amp; download
          </Button>
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="font-display text-xl">Attach document</h2>
          <Field label="Link policy">
            <select className={inputClass} value={resolvedPolicyId} onChange={(e) => setPolicyId(e.target.value)}>
              {visiblePolicies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Link claim (optional)">
            <select className={inputClass} value={claimId} onChange={(e) => setClaimId(e.target.value)}>
              <option value="">None</option>
              {visibleClaims.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number} · {c.policyNumber}
                </option>
              ))}
            </select>
          </Field>
          <Field label="File name">
            <input className={inputClass} value={uploadName} onChange={(e) => setUploadName(e.target.value)} />
          </Field>
          <Field label="Type">
            <input className={inputClass} value={uploadType} onChange={(e) => setUploadType(e.target.value)} />
          </Field>
          <Field label="Text content (optional — enables OCR)">
            <textarea className={inputClass} rows={3} value={uploadBody} onChange={(e) => setUploadBody(e.target.value)} />
          </Field>
          <Button variant="secondary" onClick={uploadDoc}>
            Save to catalogue
          </Button>
        </Card>
      </div>

      {msg ? <p className="mt-3 text-sm text-teal">{msg}</p> : null}

      <Card className="mt-4 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
          <h2 className="font-display text-xl">Catalogue</h2>
          <div className="flex flex-wrap gap-1">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                className={`rounded-lg px-2.5 py-1 text-xs capitalize ${
                  filter === t ? "bg-teal text-on-accent" : "border border-line text-mute hover:border-teal"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <Table headers={["Document", "Type", "Owner", "OCR", "Created", ""]}>
          {rows.map((d) => (
            <tr key={d.id} className="border-b border-line/70">
              <td className="px-3 py-3 font-medium">{d.name}</td>
              <td className="px-3 py-3">
                <Badge status={d.type === "Certificate" ? "verified" : "pending"} />
                <span className="ml-2 text-xs text-mute">{d.type}</span>
              </td>
              <td className="px-3 py-3 text-sm">
                {d.claimId ? (
                  <Link className="text-teal" href={`/app/claims/${d.claimId}`}>
                    {d.owner}
                  </Link>
                ) : d.policyId ? (
                  <Link className="text-teal" href={`/app/policies/${d.policyId}`}>
                    {d.owner}
                  </Link>
                ) : (
                  d.owner
                )}
              </td>
              <td className="max-w-xs px-3 py-3 text-xs text-mute">{d.ocrText ?? "—"}</td>
              <td className="px-3 py-3 text-mute text-xs">{d.createdAt.slice(0, 10)}</td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => downloadDoc(d)}>
                    Download
                  </Button>
                  {d.body || d.type.toLowerCase().includes("abstract") || d.type === "KYC" ? (
                    <Button
                      variant="ghost"
                      className="!px-2 !py-1 text-xs"
                      disabled={ocrBusy === d.id}
                      onClick={() => runOcr(d)}
                    >
                      {ocrBusy === d.id ? "OCR…" : "OCR"}
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </Table>
        {rows.length === 0 ? <p className="p-6 text-sm text-mute">No documents in this filter.</p> : null}
      </Card>
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading documents…</p>}>
      <DocumentsDesk />
    </Suspense>
  );
}
