/**
 * Safaricom Daraja — Lipa Na M-Pesa Online (STK Push)
 * Sandbox by default. Set MPESA_ENV=production for live.
 */

export type StkInitiateInput = {
  phone: string;
  amount: number;
  accountReference: string;
  description?: string;
};

export type StkInitiateResult = {
  mode: "live" | "sandbox_simulated";
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  customerMessage: string;
  phone: string;
  amount: number;
  accountReference: string;
};

export type StkCallbackBody = {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: {
        Item?: Array<{ Name: string; Value?: string | number }>;
      };
    };
  };
};

export type ParsedStkCallback = {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  success: boolean;
  amount?: number;
  mpesaReceiptNumber?: string;
  phone?: string;
  transactionDate?: string;
};

function env(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

/**
 * Where Safaricom posts the result. MPESA_CALLBACK_URL wins; otherwise the
 * production URL Vercel provides. The shared secret is appended as ?token=
 * so only Safaricom (who received the URL from us) can mark payments paid.
 */
export function mpesaCallbackUrl() {
  const base =
    env("MPESA_CALLBACK_URL") ||
    (env("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${env("VERCEL_PROJECT_PRODUCTION_URL")}/api/payments/mpesa/callback` : "");
  const secret = env("MPESA_CALLBACK_SECRET");
  if (!base || !secret) return "";
  const url = new URL(base);
  url.searchParams.set("token", secret);
  return url.toString();
}

export function isMpesaLiveConfigured() {
  return Boolean(
    env("MPESA_CONSUMER_KEY") &&
      env("MPESA_CONSUMER_SECRET") &&
      env("MPESA_SHORTCODE") &&
      env("MPESA_PASSKEY") &&
      mpesaCallbackUrl(),
  );
}

/** Constant-time comparison of the callback ?token= against MPESA_CALLBACK_SECRET. */
export function callbackTokenValid(token: string | null, secret = env("MPESA_CALLBACK_SECRET")) {
  if (!token || !secret || token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

/** Largest single STK push we allow (Safaricom's per-transaction cap is KES 250,000). */
export const MAX_STK_AMOUNT = 250_000;

export function darajaBaseUrl() {
  return env("MPESA_ENV", "sandbox") === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

/** Normalize to 2547XXXXXXXX */
export function formatKenyanPhone(input: string) {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("7")) return `254${digits}`;
  throw new Error(`Invalid Kenyan phone: ${input}`);
}

/** Daraja wants Kenyan time (EAT, UTC+3) whatever timezone the server runs in. */
export function stkTimestamp(date = new Date()) {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${eat.getUTCFullYear()}${pad(eat.getUTCMonth() + 1)}${pad(eat.getUTCDate())}` +
    `${pad(eat.getUTCHours())}${pad(eat.getUTCMinutes())}${pad(eat.getUTCSeconds())}`
  );
}

export function stkPassword(shortcode: string, passkey: string, timestamp: string) {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getDarajaAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;

  const key = env("MPESA_CONSUMER_KEY");
  const secret = env("MPESA_CONSUMER_SECRET");
  if (!key || !secret) throw new Error("MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET missing");

  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(`${darajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Daraja OAuth failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in?: string };
  const ttlMs = Number(json.expires_in ?? 3600) * 1000;
  cachedToken = { value: json.access_token, expiresAt: now + ttlMs };
  return json.access_token;
}

export async function initiateStkPush(input: StkInitiateInput): Promise<StkInitiateResult> {
  const phone = formatKenyanPhone(input.phone);
  const amount = Math.round(input.amount);
  if (!Number.isFinite(amount) || amount < 1) throw new Error("Amount must be at least KES 1");
  if (amount > MAX_STK_AMOUNT) throw new Error(`M-Pesa can take at most KES ${MAX_STK_AMOUNT.toLocaleString("en-KE")} at once`);

  if (!isMpesaLiveConfigured()) {
    // Unguessable, like Safaricom's: the id is what lets someone look a payment up.
    const checkoutRequestId = `ws_CO_SIM_${crypto.randomUUID().replaceAll("-", "")}`;
    return {
      mode: "sandbox_simulated",
      merchantRequestId: `sim-mr-${Date.now()}`,
      checkoutRequestId,
      responseCode: "0",
      customerMessage: "Success. Request accepted for processing (simulated).",
      phone,
      amount,
      accountReference: input.accountReference.slice(0, 12),
    };
  }

  const shortcode = env("MPESA_SHORTCODE");
  const passkey = env("MPESA_PASSKEY");
  const callbackUrl = mpesaCallbackUrl();
  const timestamp = stkTimestamp();
  const token = await getDarajaAccessToken();

  const payload = {
    BusinessShortCode: shortcode,
    Password: stkPassword(shortcode, passkey, timestamp),
    Timestamp: timestamp,
    TransactionType: env("MPESA_TRANSACTION_TYPE", "CustomerPayBillOnline"),
    Amount: amount,
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: input.accountReference.slice(0, 12),
    TransactionDesc: (input.description ?? "Takaful contribution").slice(0, 13),
  };

  const res = await fetch(`${darajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const json = (await res.json()) as {
    MerchantRequestID?: string;
    CheckoutRequestID?: string;
    ResponseCode?: string;
    CustomerMessage?: string;
    errorMessage?: string;
    errorCode?: string;
  };

  if (!res.ok || json.ResponseCode !== "0") {
    throw new Error(json.errorMessage || json.CustomerMessage || `STK push failed (${res.status})`);
  }

  return {
    mode: "live",
    merchantRequestId: json.MerchantRequestID ?? "",
    checkoutRequestId: json.CheckoutRequestID ?? "",
    responseCode: json.ResponseCode ?? "0",
    customerMessage: json.CustomerMessage ?? "STK push sent",
    phone,
    amount,
    accountReference: payload.AccountReference,
  };
}

export function parseStkCallback(body: StkCallbackBody): ParsedStkCallback {
  const cb = body.Body?.stkCallback;
  if (!cb) throw new Error("Invalid STK callback payload");

  const items = cb.CallbackMetadata?.Item ?? [];
  const get = (name: string) => items.find((i) => i.Name === name)?.Value;

  return {
    merchantRequestId: cb.MerchantRequestID ?? "",
    checkoutRequestId: cb.CheckoutRequestID ?? "",
    resultCode: Number(cb.ResultCode ?? 1),
    resultDesc: cb.ResultDesc ?? "",
    success: Number(cb.ResultCode) === 0,
    amount: get("Amount") != null ? Number(get("Amount")) : undefined,
    mpesaReceiptNumber: get("MpesaReceiptNumber") != null ? String(get("MpesaReceiptNumber")) : undefined,
    phone: get("PhoneNumber") != null ? String(get("PhoneNumber")) : undefined,
    transactionDate: get("TransactionDate") != null ? String(get("TransactionDate")) : undefined,
  };
}

export type StkQueryOutcome =
  | { final: false }
  | { final: true; success: boolean; resultCode: number; resultDesc: string };

/** Read Daraja's STK Query reply: still waiting, or a final paid/failed answer. */
export function interpretStkQuery(json: {
  ResponseCode?: string;
  ResultCode?: string | number;
  ResultDesc?: string;
  errorCode?: string;
  errorMessage?: string;
}): StkQueryOutcome {
  // "500.001.1001: The transaction is being processed" — the customer hasn't answered yet.
  if (json.errorCode) return { final: false };
  if (json.ResultCode === undefined || json.ResultCode === null || json.ResultCode === "") return { final: false };
  const resultCode = Number(json.ResultCode);
  if (!Number.isFinite(resultCode)) return { final: false };
  return { final: true, success: resultCode === 0, resultCode, resultDesc: json.ResultDesc ?? "" };
}

/** Ask Safaricom directly how an STK push ended — used when the callback is late or lost. */
export async function queryStkPush(checkoutRequestId: string): Promise<StkQueryOutcome> {
  if (!isMpesaLiveConfigured()) return { final: false };
  const shortcode = env("MPESA_SHORTCODE");
  const timestamp = stkTimestamp();
  const token = await getDarajaAccessToken();
  const res = await fetch(`${darajaBaseUrl()}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: stkPassword(shortcode, env("MPESA_PASSKEY"), timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
    cache: "no-store",
  });
  return interpretStkQuery((await res.json().catch(() => ({}))) as Parameters<typeof interpretStkQuery>[0]);
}
