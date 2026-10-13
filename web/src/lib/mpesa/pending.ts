import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { ParsedStkCallback, StkInitiateResult } from "./daraja";

/**
 * Where STK requests live between "push sent" and "paid".
 *
 * With Supabase: private.mpesa_requests via SECURITY DEFINER functions
 * (supabase/migrations/00013_mpesa_requests.sql) — survives serverless
 * restarts, can't be listed, and only the callback secret can mark one paid.
 * Without Supabase (local demo): an in-memory map with the same behaviour.
 */

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
  lastCheckedAt?: string;
  receipt?: string;
  resultDesc?: string;
};

export type StkMeta = Pick<PendingStk, "policyId" | "policyNumber" | "participantName" | "participantId">;

/** Simulated pushes "succeed" this long after they're sent, so demos behave like a real PIN prompt. */
export const SIMULATED_DELAY_MS = 8_000;

const dbBacked = () => isSupabaseConfigured();

// ------------------------------------------------------------------ in-memory (no Supabase)

const g = globalThis as typeof globalThis & { __bimafyStkPending?: Map<string, PendingStk> };
const memory = () => (g.__bimafyStkPending ??= new Map());

// ------------------------------------------------------------------ shared API

type StatusRow = {
  checkout_request_id: string;
  merchant_request_id: string | null;
  mode: PendingStk["mode"];
  status: PendingStk["status"];
  phone: string;
  amount: number | string;
  account_reference: string;
  policy_id: string | null;
  policy_number: string | null;
  participant_id: string | null;
  participant_name: string | null;
  receipt: string | null;
  result_desc: string | null;
  created_at: string;
  last_checked_at: string | null;
};

function fromRow(r: StatusRow): PendingStk {
  return {
    checkoutRequestId: r.checkout_request_id,
    merchantRequestId: r.merchant_request_id ?? "",
    mode: r.mode,
    status: r.status,
    phone: r.phone,
    amount: Number(r.amount),
    accountReference: r.account_reference,
    policyId: r.policy_id ?? undefined,
    policyNumber: r.policy_number ?? undefined,
    participantId: r.participant_id ?? undefined,
    participantName: r.participant_name ?? undefined,
    receipt: r.receipt ?? undefined,
    resultDesc: r.result_desc ?? undefined,
    createdAt: r.created_at,
    lastCheckedAt: r.last_checked_at ?? undefined,
  };
}

export async function savePendingStk(result: StkInitiateResult, meta: StkMeta): Promise<PendingStk> {
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
  if (!dbBacked()) {
    memory().set(row.checkoutRequestId, row);
    return row;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("mpesa_record_request", {
    p: {
      checkout_request_id: row.checkoutRequestId,
      merchant_request_id: row.merchantRequestId,
      mode: row.mode,
      phone: row.phone,
      amount: row.amount,
      account_reference: row.accountReference,
      policy_id: meta.policyId ?? null,
      policy_number: meta.policyNumber ?? null,
      participant_id: meta.participantId ?? null,
      participant_name: meta.participantName ?? null,
    },
  });
  if (error) throw new Error(`Could not record the M-Pesa request: ${error.message}`);
  return (await getPendingStk(row.checkoutRequestId)) ?? row;
}

export async function getPendingStk(checkoutRequestId: string): Promise<PendingStk | null> {
  if (!dbBacked()) return memory().get(checkoutRequestId) ?? null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mpesa_request_status", { p_checkout_request_id: checkoutRequestId });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as StatusRow | undefined;
  return row ? fromRow(row) : null;
}

/** Record Safaricom's final answer. `secret` is MPESA_CALLBACK_SECRET; the database checks it again. */
export async function applyStkResult(parsed: ParsedStkCallback, secret: string): Promise<PendingStk["status"]> {
  const status: PendingStk["status"] = parsed.success ? "completed" : "failed";
  if (!dbBacked()) {
    const row = memory().get(parsed.checkoutRequestId);
    if (row && row.status !== "pending") return row.status;
    memory().set(parsed.checkoutRequestId, {
      checkoutRequestId: parsed.checkoutRequestId,
      merchantRequestId: parsed.merchantRequestId,
      phone: row?.phone ?? parsed.phone ?? "",
      amount: parsed.amount ?? row?.amount ?? 0,
      accountReference: row?.accountReference ?? "",
      mode: row?.mode ?? "live",
      createdAt: row?.createdAt ?? new Date().toISOString(),
      ...row,
      status,
      receipt: parsed.mpesaReceiptNumber ?? row?.receipt,
      resultDesc: parsed.resultDesc,
    });
    return status;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mpesa_apply_result", {
    p_secret: secret,
    p_checkout_request_id: parsed.checkoutRequestId,
    p_success: parsed.success,
    p_result_code: parsed.resultCode,
    p_result_desc: parsed.resultDesc,
    p_receipt: parsed.mpesaReceiptNumber ?? null,
    p_amount: parsed.amount ?? null,
    p_phone: parsed.phone ?? null,
    p_merchant_request_id: parsed.merchantRequestId || null,
  });
  if (error) throw new Error(error.message);
  return data as PendingStk["status"];
}

/** Demo mode: complete a simulated push once SIMULATED_DELAY_MS has passed (stateless, no timers). */
export async function settleSimulated(row: PendingStk): Promise<PendingStk> {
  if (row.mode !== "sandbox_simulated" || row.status !== "pending") return row;
  if (Date.now() - Date.parse(row.createdAt) < SIMULATED_DELAY_MS) return row;
  if (!dbBacked()) {
    const done: PendingStk = {
      ...row,
      status: "completed",
      receipt: `SIM${Math.floor(100000 + Math.random() * 899999)}`,
      resultDesc: "The service request is processed successfully (simulated).",
    };
    memory().set(row.checkoutRequestId, done);
    return done;
  }
  const supabase = await createClient();
  await supabase.rpc("mpesa_simulate_result", { p_checkout_request_id: row.checkoutRequestId });
  return (await getPendingStk(row.checkoutRequestId)) ?? row;
}

/** True at most once every 10 seconds per request, so polling clients can't hammer Safaricom. */
export async function claimStatusCheck(checkoutRequestId: string): Promise<boolean> {
  if (!dbBacked()) {
    const row = memory().get(checkoutRequestId);
    if (!row || row.status !== "pending") return false;
    if (row.lastCheckedAt && Date.now() - Date.parse(row.lastCheckedAt) < 10_000) return false;
    row.lastCheckedAt = new Date().toISOString();
    return true;
  }
  const supabase = await createClient();
  const { data } = await supabase.rpc("mpesa_mark_checked", { p_checkout_request_id: checkoutRequestId });
  return data === true;
}
