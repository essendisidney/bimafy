import type { ParsedStkCallback, StkInitiateResult } from "./daraja";

export type PendingStk = {
  checkoutRequestId: string;
  merchantRequestId: string;
  policyId?: string;
  policyNumber?: string;
  participantName?: string;
  participantId?: string;
  phone: string;
  amount: number;
  accountReference: string;
  status: "pending" | "completed" | "failed";
  mode: "live" | "sandbox_simulated";
  createdAt: string;
  receipt?: string;
  resultDesc?: string;
};

const g = globalThis as typeof globalThis & {
  __bimafyStkPending?: Map<string, PendingStk>;
};

function store() {
  if (!g.__bimafyStkPending) g.__bimafyStkPending = new Map();
  return g.__bimafyStkPending;
}

export function savePendingStk(result: StkInitiateResult, meta: Omit<PendingStk, keyof StkInitiateResult | "status" | "createdAt" | "checkoutRequestId" | "merchantRequestId" | "mode" | "phone" | "amount" | "accountReference"> & {
  policyId?: string;
  policyNumber?: string;
  participantName?: string;
  participantId?: string;
}) {
  const row: PendingStk = {
    checkoutRequestId: result.checkoutRequestId,
    merchantRequestId: result.merchantRequestId,
    phone: result.phone,
    amount: result.amount,
    accountReference: result.accountReference,
    mode: result.mode,
    status: "pending",
    createdAt: new Date().toISOString(),
    ...meta,
  };
  store().set(row.checkoutRequestId, row);
  return row;
}

export function getPendingStk(checkoutRequestId: string) {
  return store().get(checkoutRequestId) ?? null;
}

export function listPendingStk() {
  return [...store().values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function applyStkCallback(parsed: ParsedStkCallback) {
  const row = store().get(parsed.checkoutRequestId);
  if (!row) {
    const created: PendingStk = {
      checkoutRequestId: parsed.checkoutRequestId,
      merchantRequestId: parsed.merchantRequestId,
      phone: parsed.phone ?? "",
      amount: parsed.amount ?? 0,
      accountReference: "",
      status: parsed.success ? "completed" : "failed",
      mode: "live",
      createdAt: new Date().toISOString(),
      receipt: parsed.mpesaReceiptNumber,
      resultDesc: parsed.resultDesc,
    };
    store().set(created.checkoutRequestId, created);
    return created;
  }

  row.status = parsed.success ? "completed" : "failed";
  row.receipt = parsed.mpesaReceiptNumber;
  row.resultDesc = parsed.resultDesc;
  if (parsed.amount != null) row.amount = parsed.amount;
  store().set(row.checkoutRequestId, row);
  return row;
}

/** Demo/sandbox auto-complete after a short delay when Daraja credentials are absent. */
export function simulateSuccessfulCallback(checkoutRequestId: string) {
  const row = store().get(checkoutRequestId);
  if (!row || row.status !== "pending") return row ?? null;
  row.status = "completed";
  row.receipt = `SIM${Math.floor(100000 + Math.random() * 899999)}`;
  row.resultDesc = "The service request is processed successfully (simulated).";
  store().set(checkoutRequestId, row);
  return row;
}
