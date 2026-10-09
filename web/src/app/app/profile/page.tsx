"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { pushNotification } from "@/lib/events/ledger";
import { participants } from "@/lib/seed";
import { platformStore, usePlatform } from "@/lib/store";
import type { AmlScreening } from "@/lib/types";
import { Badge, Button, Card, PageHeader } from "@/components/ui";

export default function ProfilePage() {
  const { user } = useAuth();
  const { kycOverrides } = usePlatform();
  const [msg, setMsg] = useState("");
  if (!user) return null;
  const participant = participants.find((p) => p.id === user.participantId);
  const kyc = participant ? kycOverrides[participant.id] ?? participant.kyc : "verified";

  function submitKyc() {
    if (!participant) return;
    platformStore.setKyc(participant.id, "in_review", user!.name, participant.name);
    const screening: AmlScreening = {
      id: `scr-${crypto.randomUUID().slice(0, 8)}`,
      participantId: participant.id,
      participantName: participant.name,
      type: "aml_onboarding",
      result: "pending",
      notes: "Self-service KYC refresh submitted from profile.",
      screenedAt: new Date().toISOString(),
      screenedBy: user!.name,
    };
    platformStore.addScreening(screening, user!.name);
    pushNotification({
      channel: "email",
      title: "KYC submitted for review",
      body: `${participant.name} submitted KYC — Compliance queue updated.`,
    });
    setMsg("KYC submitted for compliance review.");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Identity & KYC"
        title="Profile"
        description="Digital onboarding, ID verification, biometrics and customer profiling."
        actions={
          <Button href="/app/documents" variant="secondary">
            My documents
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3 p-5 text-sm">
          <Row k="Name" v={user.name} />
          <Row k="Email" v={user.email} />
          <Row k="Phone" v={user.phone} />
          <Row k="Branch" v={user.branch} />
          <Row k="Role" v={user.role.replaceAll("_", " ")} />
        </Card>
        <Card className="space-y-3 p-5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-mute">KYC status</span>
            <Badge status={kyc} />
          </div>
          <Row k="National ID" v={participant?.nationalId ?? "Staff record"} />
          <Row k="Date of birth" v={participant?.dob ?? "—"} />
          <Row k="Occupation" v={participant?.occupation ?? "—"} />
          <Row k="Risk score" v={participant ? String(participant.riskScore) : "—"} />
          {participant ? (
            <div className="pt-2">
              {kyc === "in_review" ? (
                <p className="text-xs text-mute">Compliance is reviewing your KYC.</p>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (kyc === "verified") {
                      platformStore.setKyc(participant.id, "pending", user.name, participant.name);
                      setMsg("KYC marked for refresh — submit when ready.");
                      return;
                    }
                    submitKyc();
                  }}
                >
                  {kyc === "verified" ? "Request KYC refresh" : "Submit KYC for review"}
                </Button>
              )}
              {msg ? <p className="mt-2 text-xs text-teal">{msg}</p> : null}
            </div>
          ) : null}
          <p className="pt-2 text-xs text-mute">
            Certificates and KYC files live on the{" "}
            <a href="/app/documents" className="text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal">
              Documents
            </a>{" "}
            desk. IPRS updates from Compliance.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line pb-2">
      <span className="text-mute">{k}</span>
      <span className="font-medium capitalize">{v}</span>
    </div>
  );
}
