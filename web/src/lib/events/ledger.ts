"use client";

import { persistJournal, persistPayment } from "@/lib/data";
import { buildPolicyCertificateHtml } from "@/lib/documents/certificate";
import { commissionRate } from "@/lib/engines/agency";
import { brokers, products } from "@/lib/seed";
import { platformStore } from "@/lib/store";
import { enqueueWebhook } from "@/lib/webhooks";
import type {
  Claim,
  DocumentItem,
  JournalEntry,
  NotificationItem,
  Payment,
  PaymentMethod,
  Policy,
  PolicyEndorsement,
} from "@/lib/types";

/** Side-effect hub for PAS events: payment, journal, notification, policy activation. */
export function recordContribution(input: {
  payment: Omit<Payment, "id"> & { id?: string };
  policy?: Policy | null;
  notify?: boolean;
}) {
  const payment: Payment = {
    id: input.payment.id ?? `pay-${crypto.randomUUID().slice(0, 8)}`,
    ...input.payment,
  };
  platformStore.addPayment(payment);
  void persistPayment({
    ...payment,
    policyId: payment.policyId ?? input.policy?.id,
    participantId: payment.participantId ?? input.policy?.participantId,
  });

  let activated: Policy | null = null;
  if (input.policy?.status === "pending_payment") {
    platformStore.updatePolicy(input.policy.id, { status: "active" });
    activated = { ...input.policy, status: "active" };
  }

  postJournal({
    reference: payment.reference,
    memo: `Contribution ${payment.method.replaceAll("_", " ")} · ${payment.policyNumber ?? "unallocated"}`,
    debit: payment.amount,
    credit: payment.amount,
  });

  if (input.notify !== false) {
    pushNotification({
      channel: payment.method.startsWith("mpesa") ? "sms" : "email",
      title: "Contribution received",
      body: `KES ${Math.round(payment.amount).toLocaleString()} received${
        payment.policyNumber ? ` for ${payment.policyNumber}` : ""
      }. Receipt ${payment.receipt ?? payment.reference}.`,
    });
  }

  enqueueWebhook("payment.completed", {
    reference: payment.reference,
    amount: payment.amount,
    policyNumber: payment.policyNumber ?? null,
    status: payment.status,
  });

  if (activated) {
    issuePolicyCertificate(activated);
  }

  creditCommission(input.policy ?? null, payment.amount);

  return payment;
}

/** Claim settlement: payment row + journal + SMS (status update stays with caller). */
export function recordClaimPayout(claim: Claim) {
  const amount = claim.approved ?? claim.claimed;
  const payment: Payment = {
    id: `cpay-${crypto.randomUUID().slice(0, 8)}`,
    reference: `CLAIM-${claim.number}`,
    policyNumber: claim.policyNumber,
    participantName: claim.participantName,
    method: "mpesa_stk",
    status: "completed",
    amount,
    paidAt: new Date().toISOString(),
    receipt: String(Math.floor(Math.random() * 900000 + 100000)),
  };
  platformStore.addPayment(payment);
  void persistPayment({ ...payment, policyId: claim.policyId, participantId: claim.participantId });
  postJournal({
    reference: payment.reference,
    memo: `Claim settlement · ${claim.number} · ${claim.policyNumber}`,
    debit: amount,
    credit: amount,
  });
  enqueueWebhook("claim.paid", {
    claimNumber: claim.number,
    policyNumber: claim.policyNumber,
    amount,
  });
  pushNotification({
    channel: "sms",
    title: "Claim paid",
    body: `${claim.number}: KES ${Math.round(amount).toLocaleString()} settled to ${claim.participantName}.`,
  });
  return payment;
}

/** Issue (or reuse) a certificate document when a policy becomes active. */
export function issuePolicyCertificate(policy: Policy) {
  const existing = platformStore
    .get()
    .documents.find((d) => d.policyId === policy.id && d.type === "Certificate");
  if (existing) return existing;

  const active = { ...policy, status: "active" as const };
  const body = buildPolicyCertificateHtml(active);
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
  pushNotification({
    channel: "whatsapp",
    title: "Certificate ready",
    body: `${policy.number} certificate is in Documents.`,
  });
  return doc;
}

export function postJournal(input: {
  reference: string;
  memo: string;
  debit: number;
  credit: number;
  date?: string;
}) {
  const entry: JournalEntry = {
    id: `j-${crypto.randomUUID().slice(0, 8)}`,
    date: input.date ?? new Date().toISOString().slice(0, 10),
    reference: input.reference,
    memo: input.memo,
    debit: input.debit,
    credit: input.credit,
  };
  platformStore.addJournal(entry);
  void persistJournal(entry);
  return entry;
}

export function pushNotification(input: {
  channel: NotificationItem["channel"];
  title: string;
  body: string;
  status?: NotificationItem["status"];
  href?: string;
}) {
  const row: NotificationItem = {
    id: `n-${crypto.randomUUID().slice(0, 8)}`,
    channel: input.channel,
    title: input.title,
    body: input.body,
    status: input.status ?? "sent",
    createdAt: new Date().toISOString(),
    href: input.href,
  };
  platformStore.addNotification(row);
  return row;
}

export function recordChannelPayment(input: {
  phone: string;
  amount: number;
  method?: PaymentMethod;
  policyNumber?: string;
  participantName?: string;
}) {
  const policy = input.policyNumber
    ? platformStore.get().policies.find((p) => p.number === input.policyNumber)
    : undefined;
  return recordContribution({
    payment: {
      reference: `USSD-${Date.now().toString().slice(-6)}`,
      policyNumber: input.policyNumber,
      participantName: input.participantName ?? input.phone,
      method: input.method ?? "mpesa_till",
      status: "completed",
      amount: input.amount,
      paidAt: new Date().toISOString(),
      receipt: String(Math.floor(Math.random() * 900000 + 100000)),
    },
    policy,
  });
}

function creditCommission(policy: Policy | null | undefined, contribution: number) {
  if (!policy || contribution <= 0) return;
  if (policy.brokerId) {
    const broker = brokers.find((b) => b.id === policy.brokerId);
    const rate = broker?.commissionRate ?? 0.1;
    const commission = Math.round(contribution * rate);
    platformStore.creditDistributor(policy.brokerId, commission, contribution);
    postJournal({
      reference: `COMM-${policy.number}`,
      memo: `Broker commission · ${broker?.name ?? policy.brokerId} · ${policy.number}`,
      debit: commission,
      credit: commission,
    });
    return;
  }
  if (policy.agentId) {
    const line = products.find((p) => p.id === policy.productId)?.line;
    const commission = Math.round(contribution * commissionRate(line));
    platformStore.creditDistributor(policy.agentId, commission, contribution);
    postJournal({
      reference: `COMM-${policy.number}`,
      memo: `Agent commission · ${policy.agentName ?? policy.agentId} · ${policy.number}`,
      debit: commission,
      credit: commission,
    });
  }
}

export type PolicyLifecycleAction =
  | "activate"
  | "suspend"
  | "reinstate"
  | "cancel"
  | "expire"
  | "lapse"
  | "renew"
  | "endorse";

/** Apply PAS lifecycle with certificate / journal / notification side-effects. */
export function applyPolicyLifecycle(
  policy: Policy,
  action: PolicyLifecycleAction,
  opts?: { endorseSumCovered?: number; endorseContribution?: number },
): Policy {
  let patch: Partial<Policy> = {};
  const next = { ...policy, history: [...(policy.history ?? [])] };

  if (action === "activate") {
    patch = { status: "active" };
    next.status = "active";
  } else if (action === "suspend") {
    patch = { status: "suspended" };
    next.status = "suspended";
  } else if (action === "reinstate") {
    patch = { status: "active" };
    next.status = "active";
  } else if (action === "cancel") {
    patch = { status: "cancelled" };
    next.status = "cancelled";
  } else if (action === "expire") {
    patch = { status: "expired" };
    next.status = "expired";
  } else if (action === "lapse") {
    patch = { status: "lapsed" };
    next.status = "lapsed";
  } else if (action === "renew") {
    const expiry = new Date(policy.expiry);
    expiry.setFullYear(expiry.getFullYear() + 1);
    const inception = policy.expiry;
    patch = {
      status: "active",
      inception,
      expiry: expiry.toISOString().slice(0, 10),
    };
    Object.assign(next, patch);
  } else if (action === "endorse") {
    const sumCovered = opts?.endorseSumCovered ?? Math.round(policy.sumCovered * 1.1);
    const contribution = opts?.endorseContribution ?? Math.round(policy.contribution * 1.08);
    const wakala = Math.round(contribution * 0.15);
    const tabarru = contribution - wakala;
    const material = sumCovered >= policy.sumCovered * 1.05;
    if (material) {
      patch = {
        status: "pending_underwriting",
        pendingEndorsement: {
          sumCovered,
          contribution,
          wakala,
          tabarru,
          requestedAt: new Date().toISOString(),
        },
      };
      Object.assign(next, patch);
    } else {
      patch = { sumCovered, contribution, wakala, tabarru, status: "active", pendingEndorsement: undefined };
      Object.assign(next, patch);
    }
  }

  const event: PolicyEndorsement = {
    id: `eh-${crypto.randomUUID().slice(0, 8)}`,
    at: new Date().toISOString(),
    action: action === "endorse" && next.status === "pending_underwriting" ? "endorse_pending" : action,
    summary:
      action === "endorse" && next.status === "pending_underwriting"
        ? `Pending UW · SI ${policy.sumCovered.toLocaleString()} → ${next.pendingEndorsement?.sumCovered.toLocaleString()}`
        : action === "endorse"
          ? `SI ${policy.sumCovered.toLocaleString()} → ${next.sumCovered.toLocaleString()}; contribution ${policy.contribution.toLocaleString()} → ${next.contribution.toLocaleString()}`
        : action === "renew"
          ? `Renewed to ${next.expiry}`
          : `Status → ${next.status}`,
    beforeSumCovered: policy.sumCovered,
    afterSumCovered: next.pendingEndorsement?.sumCovered ?? next.sumCovered,
    beforeContribution: policy.contribution,
    afterContribution: next.pendingEndorsement?.contribution ?? next.contribution,
  };
  next.history = [event, ...next.history];
  patch = { ...patch, history: next.history };

  platformStore.updatePolicy(policy.id, patch);
  platformStore.addAuditLog({
    action: `policy.${action}`,
    actor: "PAS",
    subject: policy.number,
    detail: event.summary,
  });

  if (action === "activate" || action === "reinstate" || action === "renew" || (action === "endorse" && next.status === "active")) {
    issuePolicyCertificate(next);
  }

  if (action === "renew") {
    postJournal({
      reference: `REN-${policy.number}`,
      memo: `Renewal · ${policy.number} · ${policy.participantName}`,
      debit: policy.contribution,
      credit: policy.contribution,
    });
    creditCommission(next, policy.contribution);
  }

  if (action === "endorse" && next.status === "active") {
    const delta = Math.max(0, (next.contribution ?? 0) - policy.contribution);
    postJournal({
      reference: `END-${policy.number}`,
      memo: `Endorsement · ${policy.number} · sum ${next.sumCovered}`,
      debit: next.contribution,
      credit: next.contribution,
    });
    if (delta > 0) creditCommission(next, delta);
  }

  if (action === "endorse" && next.status === "pending_underwriting") {
    pushNotification({
      channel: "email",
      title: "Endorsement referred",
      body: `${policy.number} SI increase awaiting underwriter.`,
      href: "/app/underwriting",
    });
  }

  if (action === "cancel" || action === "lapse") {
    postJournal({
      reference: `${action === "lapse" ? "LPS" : "CXL"}-${policy.number}`,
      memo: `${action === "lapse" ? "Lapse" : "Cancellation"} · ${policy.number}`,
      debit: 0,
      credit: 0,
    });
  }

  const titles: Record<PolicyLifecycleAction, string> = {
    activate: "Policy activated",
    suspend: "Policy suspended",
    reinstate: "Policy reinstated",
    cancel: "Policy cancelled",
    expire: "Policy expired",
    lapse: "Policy lapsed",
    renew: "Policy renewed",
    endorse: next.status === "pending_underwriting" ? "Endorsement pending UW" : "Policy endorsed",
  };
  if (!(action === "endorse" && next.status === "pending_underwriting")) {
    pushNotification({
      channel: "sms",
      title: titles[action],
      body: `${policy.number} for ${policy.participantName} is now ${next.status}${
        action === "renew" ? ` · expiry ${next.expiry}` : ""
      }.`,
      href: `/app/policies/${policy.id}`,
    });
  }

  return next;
}

/** Apply a pending endorsement after UW accept. */
export function acceptPendingEndorsement(policy: Policy): Policy {
  const pending = policy.pendingEndorsement;
  if (!pending) return policy;
  const next: Policy = {
    ...policy,
    status: "active",
    sumCovered: pending.sumCovered,
    contribution: pending.contribution,
    wakala: pending.wakala,
    tabarru: pending.tabarru,
    pendingEndorsement: undefined,
  };
  const event: PolicyEndorsement = {
    id: `eh-${crypto.randomUUID().slice(0, 8)}`,
    at: new Date().toISOString(),
    action: "endorse_accepted",
    summary: `UW accepted · SI ${policy.sumCovered.toLocaleString()} → ${pending.sumCovered.toLocaleString()}`,
    beforeSumCovered: policy.sumCovered,
    afterSumCovered: pending.sumCovered,
    beforeContribution: policy.contribution,
    afterContribution: pending.contribution,
  };
  next.history = [event, ...(policy.history ?? [])];
  platformStore.updatePolicy(policy.id, {
    status: "active",
    sumCovered: pending.sumCovered,
    contribution: pending.contribution,
    wakala: pending.wakala,
    tabarru: pending.tabarru,
    pendingEndorsement: undefined,
    history: next.history,
  });
  const delta = Math.max(0, pending.contribution - policy.contribution);
  postJournal({
    reference: `END-${policy.number}`,
    memo: `Endorsement accepted · ${policy.number}`,
    debit: pending.contribution,
    credit: pending.contribution,
  });
  if (delta > 0) creditCommission(next, delta);
  issuePolicyCertificate(next);
  pushNotification({
    channel: "sms",
    title: "Endorsement accepted",
    body: `${policy.number} SI updated to ${pending.sumCovered.toLocaleString()}.`,
    href: `/app/policies/${policy.id}`,
  });
  platformStore.addAuditLog({
    action: "policy.endorse_accepted",
    actor: "Underwriting",
    subject: policy.number,
    detail: event.summary,
  });
  return next;
}

export function withdrawCommission(input: {
  distributorId: string;
  name: string;
  amount: number;
  kind: "agent" | "broker";
}) {
  const amount = Math.round(input.amount);
  if (amount <= 0) return;
  platformStore.creditDistributor(input.distributorId, -amount, 0);
  postJournal({
    reference: `WDR-${input.distributorId}-${Date.now().toString().slice(-4)}`,
    memo: `${input.kind} commission withdrawal · ${input.name}`,
    debit: amount,
    credit: amount,
  });
  pushNotification({
    channel: "sms",
    title: "Commission withdrawn",
    body: `KES ${amount.toLocaleString()} paid to ${input.name}.`,
    href: input.kind === "broker" ? "/app/broker" : "/app/agent",
  });
}

export function recordCessionJournal(input: {
  policyNumber: string;
  treatyName: string;
  cededContribution: number;
}) {
  postJournal({
    reference: `CED-${input.policyNumber}`,
    memo: `Reinsurance cession · ${input.treatyName} · ${input.policyNumber}`,
    debit: input.cededContribution,
    credit: input.cededContribution,
  });
  pushNotification({
    channel: "email",
    title: "Cession recorded",
    body: `${input.policyNumber} ceded ${Math.round(input.cededContribution).toLocaleString()} to ${input.treatyName}.`,
  });
}

export function recordRecoveryPaid(input: {
  claimNumber: string;
  treatyName: string;
  amount: number;
  treatyId: string;
}) {
  const payment: Payment = {
    id: `rpay-${crypto.randomUUID().slice(0, 8)}`,
    reference: `RI-${input.claimNumber}`,
    participantName: input.treatyName,
    method: "bank_transfer",
    status: "completed",
    amount: input.amount,
    paidAt: new Date().toISOString(),
    receipt: String(Math.floor(Math.random() * 900000 + 100000)),
  };
  platformStore.addPayment(payment);
  void persistPayment(payment);
  postJournal({
    reference: payment.reference,
    memo: `Reinsurance recovery · ${input.claimNumber} · ${input.treatyName}`,
    debit: input.amount,
    credit: input.amount,
  });
  pushNotification({
    channel: "email",
    title: "Recovery paid",
    body: `${input.claimNumber}: KES ${Math.round(input.amount).toLocaleString()} recovered from ${input.treatyName}.`,
  });
  return payment;
}

