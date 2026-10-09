"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { applyPolicyLifecycle, pushNotification, recordContribution } from "@/lib/events/ledger";
import { money } from "@/lib/format";
import { updatePolicyRemote, usePaymentsBook, usePoliciesBook } from "@/lib/data";
import { participants } from "@/lib/seed";
import type { PaymentMethod } from "@/lib/types";
import { Badge, Button, Card, Field, PageHeader, Table, inputClass } from "@/components/ui";

const methods: PaymentMethod[] = [
  "mpesa_stk",
  "mpesa_paybill",
  "mpesa_till",
  "airtel_money",
  "bank_transfer",
  "card",
  "direct_debit",
  "flutterwave",
  "paystack",
  "cellulant",
  "stripe",
];

type StkPending = {
  checkoutRequestId: string;
  status: "pending" | "completed" | "failed";
  receipt?: string;
  amount: number;
  phone: string;
  policyNumber?: string;
  participantName?: string;
  policyId?: string;
  mode: string;
  resultDesc?: string;
};

export default function PaymentsPage() {
  const { user } = useAuth();
  const { policies, refresh: refreshPolicies } = usePoliciesBook();
  const { payments, refresh: refreshPayments } = usePaymentsBook();
  const book = useMemo(() => {
    if (user?.role === "participant" && user.participantId) {
      return policies.filter((p) => p.participantId === user.participantId);
    }
    return policies;
  }, [policies, user]);
  const visiblePayments = useMemo(() => {
    if (user?.role === "participant" && user.participantId) {
      const ids = new Set(book.map((p) => p.id));
      const numbers = new Set(book.map((p) => p.number));
      return payments.filter(
        (p) => (p.policyId && ids.has(p.policyId)) || (p.policyNumber && numbers.has(p.policyNumber)),
      );
    }
    return payments;
  }, [payments, book, user]);
  const [pickedPolicyId, setPickedPolicyId] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("mpesa_stk");
  // Edits the user typed; null means "use the selected policy's own values".
  const [amountEdit, setAmount] = useState<number | null>(null);
  const [phoneEdit, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<StkPending | null>(null);

  // Fall back to the first policy when nothing (or a policy no longer in the book) is picked.
  const policyId = book.some((p) => p.id === pickedPolicyId) ? pickedPolicyId : (book[0]?.id ?? "");
  const selectedPolicy = book.find((p) => p.id === policyId);
  const amount = amountEdit ?? selectedPolicy?.contribution ?? 200;
  const phone =
    phoneEdit ?? participants.find((p) => p.id === selectedPolicy?.participantId)?.phone ?? "+254711000111";

  function choosePolicy(id: string) {
    setPickedPolicyId(id);
    setAmount(null);
    setPhone(null);
  }

  useEffect(() => {
    if (!pending || pending.status !== "pending") return;
    const id = pending.checkoutRequestId;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/mpesa/status?checkoutRequestId=${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const row = (await res.json()) as StkPending;
        setPending(row);
        if (row.status === "completed") {
          const policy = row.policyId ? book.find((p) => p.id === row.policyId) : undefined;
          recordContribution({
            payment: {
              id: crypto.randomUUID(),
              reference: row.receipt ? `MPESA-${row.receipt}` : row.checkoutRequestId,
              policyId: row.policyId,
              policyNumber: row.policyNumber,
              participantId: policy?.participantId,
              participantName: row.participantName ?? "Participant",
              method: "mpesa_stk",
              status: "reconciled",
              amount: row.amount,
              paidAt: new Date().toISOString(),
              receipt: row.receipt,
            },
            policy,
          });
          if (policy?.status === "pending_payment") {
            void updatePolicyRemote(policy.id, { status: "active" });
          }
          refreshPayments();
          refreshPolicies();
          setMessage(`Contribution received. Receipt ${row.receipt}`);
          clearInterval(timer);
        }
        if (row.status === "failed") {
          setError(row.resultDesc ?? "STK payment failed or was cancelled");
          const policy = row.policyId ? book.find((p) => p.id === row.policyId) : undefined;
          if (policy && (policy.status === "pending_payment" || policy.status === "active")) {
            pushNotification({
              channel: "sms",
              title: "Payment failed",
              body: `${policy.number}: M-Pesa STK failed. Pay again or cover may lapse.`,
            });
            if (policy.status === "pending_payment") {
              applyPolicyLifecycle(policy, "lapse");
              void updatePolicyRemote(policy.id, { status: "lapsed" });
            }
          }
          clearInterval(timer);
        }
      } catch {
        // keep polling
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [pending, book, refreshPayments, refreshPolicies]);

  return (
    <div>
      <PageHeader
        eyebrow="Payments"
        title="Collect every way Africa pays"
        description="M-Pesa STK Push via Daraja (live when credentials are set). Collections post to the same ledger as policies and journals."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 p-5">
          <h2 className="font-display text-xl">Collect contribution</h2>
          <Field label="Policy">
            <select className={inputClass} value={policyId} onChange={(e) => choosePolicy(e.target.value)}>
              {book.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Channel">
            <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          {method === "mpesa_stk" ? (
            <Field label="M-Pesa phone">
              <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2547XXXXXXXX" />
            </Field>
          ) : null}
          <Field label="Amount">
            <input className={inputClass} type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
          {message ? <p className="text-sm text-teal">{message}</p> : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {pending?.status === "pending" ? (
            <p className="rounded-xl bg-sand px-3 py-2 text-xs text-mute">
              Waiting for M-Pesa PIN… checkout {pending.checkoutRequestId} ({pending.mode})
            </p>
          ) : null}
          <Button
            onClick={async () => {
              const policy = book.find((p) => p.id === policyId);
              if (!policy) return;
              setBusy(true);
              setError(null);
              setMessage(null);
              try {
                if (method === "mpesa_stk") {
                  const res = await fetch("/api/payments/mpesa/stk", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      phone,
                      amount,
                      accountReference: policy.number.replace(/[^A-Za-z0-9]/g, "").slice(0, 12),
                      description: "Takaful contrib",
                      policyId: policy.id,
                      policyNumber: policy.number,
                      participantName: policy.participantName,
                      participantId: policy.participantId,
                    }),
                  });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error || "STK failed");
                  setPending(json.pending as StkPending);
                  setMessage(json.customerMessage ?? "STK push sent");
                } else {
                  recordContribution({
                    payment: {
                      id: crypto.randomUUID(),
                      reference: `${method.toUpperCase()}-${Math.floor(Math.random() * 90000 + 10000)}`,
                      policyId: policy.id,
                      policyNumber: policy.number,
                      participantId: policy.participantId,
                      participantName: policy.participantName,
                      method,
                      status: "completed",
                      amount,
                      paidAt: new Date().toISOString(),
                      receipt: String(Math.floor(Math.random() * 900000 + 100000)),
                    },
                    policy,
                  });
                  if (policy.status === "pending_payment") {
                    await updatePolicyRemote(policy.id, { status: "active" });
                  }
                  refreshPayments();
                  refreshPolicies();
                  setMessage("Collection recorded · journal posted to the live ledger");
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : "Payment failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Processing…" : method === "mpesa_stk" ? "Send STK Push" : "Simulate collection"}
          </Button>
        </Card>
        <Card className="p-2 lg:col-span-2">
          <Table headers={["Reference", "Participant", "Method", "Amount", "Status"]}>
            {visiblePayments.map((p) => (
              <tr key={p.id} className="border-b border-line/70">
                <td className="px-3 py-3 font-medium">{p.reference}</td>
                <td className="px-3 py-3">{p.participantName}</td>
                <td className="px-3 py-3 capitalize">{p.method.replaceAll("_", " ")}</td>
                <td className="px-3 py-3">{money(p.amount)}</td>
                <td className="px-3 py-3">
                  <Badge status={p.status} />
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}
