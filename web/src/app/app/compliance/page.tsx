"use client";

import { useMemo, useState } from "react";
import { participants } from "@/lib/seed";
import { useAuth } from "@/lib/auth";
import { platformStore, usePlatform } from "@/lib/store";
import type { AmlResult, AmlScreening, KycStatus } from "@/lib/types";
import { Badge, Button, Card, Field, PageHeader, Stat, Table, inputClass } from "@/components/ui";

const screeningTypes: AmlScreening["type"][] = [
  "sanctions_peps",
  "aml_onboarding",
  "device_identity",
  "adverse_media",
  "iprs_refresh",
];

export default function CompliancePage() {
  const { user } = useAuth();
  const { kycOverrides, screenings, auditLogs, policies, claims, payments, journals, surplusPeriods } =
    usePlatform();
  const actor = user?.name ?? "Compliance";

  const [participantId, setParticipantId] = useState(
    participants.find((p) => p.kyc !== "verified")?.id ?? participants[0].id,
  );
  const [screenType, setScreenType] = useState<AmlScreening["type"]>("aml_onboarding");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const register = useMemo(
    () =>
      participants.map((p) => ({
        ...p,
        kyc: kycOverrides[p.id] ?? p.kyc,
      })),
    [kycOverrides],
  );

  const pendingKyc = register.filter((p) => p.kyc === "pending" || p.kyc === "in_review").length;
  const pendingAml = screenings.filter((s) => s.result === "pending" || s.result === "escalated").length;
  const selected = register.find((p) => p.id === participantId) ?? register[0];

  async function runIprs() {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const [firstName, ...rest] = selected.name.split(" ");
      const res = await fetch("/api/partners/iprs/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idNumber: selected.nationalId,
          firstName,
          lastName: rest.join(" ") || firstName,
          dateOfBirth: selected.dob,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "IPRS failed");

      const kyc: KycStatus = data.matched ? "verified" : "rejected";
      platformStore.setKyc(selected.id, kyc, actor, selected.name);
      platformStore.addScreening(
        {
          id: `scr-${crypto.randomUUID().slice(0, 8)}`,
          participantId: selected.id,
          participantName: selected.name,
          type: "iprs_refresh",
          result: data.matched ? "clear" : "hit",
          notes: data.matched
            ? `IPRS matched · confidence ${Math.round((data.confidence ?? 0) * 100)}% · ${data.reference}`
            : `IPRS mismatch · ${data.reference}`,
          screenedAt: new Date().toISOString(),
          screenedBy: actor,
        },
        actor,
      );
      setMessage(data.matched ? "IPRS matched — KYC verified." : "IPRS mismatch — KYC rejected for review.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "IPRS failed");
    } finally {
      setBusy(false);
    }
  }

  function queueScreening() {
    if (!selected) return;
    platformStore.addScreening(
      {
        id: `scr-${crypto.randomUUID().slice(0, 8)}`,
        participantId: selected.id,
        participantName: selected.name,
        type: screenType,
        result: "pending",
        notes: "Queued from compliance desk.",
        screenedAt: new Date().toISOString(),
        screenedBy: actor,
      },
      actor,
    );
    if (selected.kyc === "pending") {
      platformStore.setKyc(selected.id, "in_review", actor, selected.name);
    }
    setMessage("Screening queued.");
  }

  function setScreeningResult(id: string, result: AmlResult) {
    platformStore.updateScreening(id, { result, screenedBy: actor }, actor);
    const row = screenings.find((s) => s.id === id);
    if (row && result === "hit") {
      platformStore.setKyc(row.participantId, "in_review", actor, row.participantName);
    }
    if (row && result === "clear") {
      const subject = register.find((p) => p.id === row.participantId);
      if (subject && (subject.kyc === "pending" || subject.kyc === "in_review")) {
        platformStore.setKyc(row.participantId, "verified", actor, row.participantName);
      }
    }
  }

  function downloadIraPack() {
    const pack = {
      generatedAt: new Date().toISOString(),
      operator: "Bimafy Kenya",
      license: "IRA/INS/2024/014",
      retentionNote: "Insurance records retained 7–10 years per IRA guidance.",
      summary: {
        policies: policies.length,
        activePolicies: policies.filter((p) => p.status === "active").length,
        claims: claims.length,
        payments: payments.length,
        gwpAnnualized: policies.reduce((s, p) => s + p.contribution, 0),
        surplusPeriods: surplusPeriods.length,
      },
      kycRegister: register.map((p) => ({
        id: p.id,
        name: p.name,
        nationalId: p.nationalId,
        kyc: p.kyc,
        channel: p.channel,
        county: p.county,
      })),
      policies: policies.map((p) => ({
        number: p.number,
        participant: p.participantName,
        product: p.productName,
        status: p.status,
        contribution: p.contribution,
        sumCovered: p.sumCovered,
        inception: p.inception,
        expiry: p.expiry,
        branch: p.branch,
      })),
      claims: claims.map((c) => ({
        number: c.number,
        policy: c.policyNumber,
        status: c.status,
        claimed: c.claimed,
        approved: c.approved,
        fraudScore: c.fraudScore,
      })),
      payments: payments.slice(0, 200).map((p) => ({
        reference: p.reference,
        policy: p.policyNumber,
        amount: p.amount,
        method: p.method,
        status: p.status,
        paidAt: p.paidAt,
      })),
      journals: journals.slice(0, 100),
      surplusPeriods: surplusPeriods.map((s) => ({
        code: s.code,
        label: s.label,
        status: s.status,
        netSurplus: s.netSurplus,
      })),
      screenings,
      auditLogs: auditLogs.slice(0, 100),
    };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `insurax-ira-compliance-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    platformStore.addAuditLog({
      action: "compliance.ira_export",
      actor,
      subject: "IRA pack",
      detail: `Exported ${policies.length} policies, ${claims.length} claims, ${payments.length} payments.`,
    });
    setMessage("IRA compliance pack downloaded (PAS + KYC + AML).");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Compliance"
        title="AML, KYC, sanctions, audit"
        description="Update KYC, queue screenings, clear or escalate hits, run IPRS, and export an IRA pack."
        actions={
          <Button variant="secondary" onClick={downloadIraPack}>
            Export IRA pack
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Participants" value={String(register.length)} />
        <Stat label="KYC pending / review" value={String(pendingKyc)} />
        <Stat label="Open screenings" value={String(pendingAml)} />
        <Stat label="Audit events" value={String(auditLogs.length)} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="space-y-3 p-5">
          <h2 className="font-display text-xl">Actions</h2>
          <Field label="Participant">
            <select className={inputClass} value={participantId} onChange={(e) => setParticipantId(e.target.value)}>
              {register.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.kyc}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Screening type">
            <select
              className={inputClass}
              value={screenType}
              onChange={(e) => setScreenType(e.target.value as AmlScreening["type"])}
            >
              {screeningTypes.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={runIprs}>
              {busy ? "IPRS…" : "Run IPRS verify"}
            </Button>
            <Button variant="secondary" onClick={queueScreening}>
              Queue screening
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {(["in_review", "verified", "rejected", "expired"] as KycStatus[]).map((k) => (
              <Button
                key={k}
                variant="ghost"
                className="!px-2 !py-1 text-xs"
                onClick={() => selected && platformStore.setKyc(selected.id, k, actor, selected.name)}
              >
                KYC {k.replaceAll("_", " ")}
              </Button>
            ))}
          </div>
          {message ? <p className="text-sm text-teal">{message}</p> : null}
          <p className="text-xs text-mute">
            Also on{" "}
            <a href="/app/integrations" className="text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal">
              Partners &amp; OCR
            </a>{" "}
            and{" "}
            <a href="/app/shariah" className="text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal">
              Surplus &amp; Shariah
            </a>
            .
          </p>
        </Card>

        <Card className="p-2 xl:col-span-2">
          <h2 className="px-3 pt-3 font-display text-xl">KYC register</h2>
          <Table headers={["Participant", "National ID", "Status", "Channel", ""]}>
            {register.map((p) => (
              <tr key={p.id} className="border-b border-line/70">
                <td className="px-3 py-3">
                  <button
                    type="button"
                    className="text-left font-medium text-teal hover:underline"
                    onClick={() => setParticipantId(p.id)}
                  >
                    {p.name}
                  </button>
                </td>
                <td className="px-3 py-3">{p.nationalId}</td>
                <td className="px-3 py-3">
                  <Badge status={p.kyc} />
                </td>
                <td className="px-3 py-3 capitalize">{p.channel}</td>
                <td className="px-3 py-3">
                  <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setParticipantId(p.id)}>
                    Select
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <Card className="mt-4 p-2">
        <h2 className="px-3 pt-3 font-display text-xl">Screenings</h2>
        <Table headers={["Subject", "Check", "Result", "Notes", "When", ""]}>
          {screenings.map((s) => (
            <tr key={s.id} className="border-b border-line/70">
              <td className="px-3 py-3">{s.participantName}</td>
              <td className="px-3 py-3 capitalize">{s.type.replaceAll("_", " ")}</td>
              <td className="px-3 py-3">
                <Badge
                  status={
                    s.result === "clear"
                      ? "verified"
                      : s.result === "hit" || s.result === "escalated"
                        ? "rejected"
                        : "pending"
                  }
                />
              </td>
              <td className="max-w-xs px-3 py-3 text-xs text-mute">{s.notes ?? "—"}</td>
              <td className="px-3 py-3 text-xs text-mute">{s.screenedAt.slice(0, 10)}</td>
              <td className="px-3 py-3">
                {s.result === "pending" || s.result === "escalated" ? (
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setScreeningResult(s.id, "clear")}>
                      Clear
                    </Button>
                    <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setScreeningResult(s.id, "hit")}>
                      Hit
                    </Button>
                    <Button
                      variant="ghost"
                      className="!px-2 !py-1 text-xs"
                      onClick={() => setScreeningResult(s.id, "escalated")}
                    >
                      Escalate
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-mute">{s.screenedBy ?? "—"}</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card className="mt-4 p-2">
        <h2 className="px-3 pt-3 font-display text-xl">Audit log</h2>
        <Table headers={["When", "Actor", "Action", "Subject", "Detail"]}>
          {auditLogs.slice(0, 20).map((a) => (
            <tr key={a.id} className="border-b border-line/70">
              <td className="px-3 py-3 text-xs text-mute">{a.createdAt.slice(0, 16).replace("T", " ")}</td>
              <td className="px-3 py-3">{a.actor}</td>
              <td className="px-3 py-3 font-medium">{a.action}</td>
              <td className="px-3 py-3">{a.subject}</td>
              <td className="px-3 py-3 text-xs text-mute">{a.detail}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
