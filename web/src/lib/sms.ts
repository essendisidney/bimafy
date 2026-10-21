import { createCipheriv } from "node:crypto";
import { msisdn } from "./engines/agency.ts";

/**
 * Outbound SMS. Taifa Mobile is used when TAIFA_MOBILE_API_KEY is set,
 * otherwise Africa's Talking (AFRICASTALKING_USERNAME / _API_KEY). With
 * neither, sends are simulated so demos and previews still work end to end.
 */

export const MAX_SMS_CHARS = 459; // three SMS parts

export type SmsProvider = "taifa" | "africastalking";

export function smsProvider(): SmsProvider | null {
  if (process.env.TAIFA_MOBILE_API_KEY) return "taifa";
  if (process.env.AFRICASTALKING_USERNAME && process.env.AFRICASTALKING_API_KEY) return "africastalking";
  return null;
}

export function isSmsLiveConfigured() {
  return smsProvider() !== null;
}

/** 2547XXXXXXXX / 2541XXXXXXXX, or null when it isn't a Kenyan mobile number. */
export function kenyanMobile(phone: string) {
  const digits = msisdn(phone);
  return /^254[17]\d{8}$/.test(digits) ? digits : null;
}

export type SmsResult = {
  mode: "live" | "simulated";
  provider: SmsProvider | null;
  to: string;
  status: string;
  messageId?: string;
  cost?: string;
};

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  const to = kenyanMobile(phone);
  if (!to) throw new Error("Enter a Kenyan mobile number (07… or 01…)");
  const text = message.trim();
  if (!text) throw new Error("The message is empty");
  if (text.length > MAX_SMS_CHARS) throw new Error(`Keep the message under ${MAX_SMS_CHARS} characters`);

  const provider = smsProvider();
  if (provider === "taifa") return sendTaifa(to, text);
  if (provider === "africastalking") return sendAfricasTalking(to, text);
  return { mode: "simulated", provider: null, to, status: "Simulated" };
}

// ------------------------------------------------------------------ Taifa Mobile

const TAIFA_URL = "https://sms.taifamobile.co.ke/clientapi/sms/";
/** Fixed IV from Taifa Mobile's client library (github.com/taifaMobile/sms). */
const TAIFA_IV = Buffer.from("w4^dgd$%^62:)dgs", "utf8");

const TAIFA_STATUS: Record<string, string> = {
  "00": "Success",
  "01": "Failed",
  "97": "Not enough SMS credit on the Taifa Mobile account",
  "98": "Taifa Mobile service not found — check TAIFA_MOBILE_SERVICE_NAME",
  "99": "Taifa Mobile rejected the request (missing details)",
};

/**
 * Taifa Mobile expects the JSON payload AES-128-CBC encrypted with the API key
 * and hex-encoded — the same as PHP's openssl_encrypt, which zero-pads (or
 * truncates) the key to 16 bytes.
 */
export function taifaEncrypt(plaintext: string, apiKey: string) {
  const key = Buffer.alloc(16);
  Buffer.from(apiKey, "utf8").copy(key, 0, 0, 16);
  const cipher = createCipheriv("aes-128-cbc", key, TAIFA_IV);
  return Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]).toString("hex");
}

/** The request body Taifa Mobile's /clientapi/sms/ endpoint takes. */
export function taifaBody(to: string, message: string, apiKey: string, serviceName?: string | null) {
  const encrypted = taifaEncrypt(JSON.stringify({ message, recepients: to }), apiKey);
  return { message: encrypted, key: apiKey, service_name: serviceName || null };
}

async function sendTaifa(to: string, text: string): Promise<SmsResult> {
  const apiKey = process.env.TAIFA_MOBILE_API_KEY!;
  // TAIFA_MOBILE_URL only exists to point tests at a stand-in server.
  const res = await fetch(process.env.TAIFA_MOBILE_URL || TAIFA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(taifaBody(to, text, apiKey, process.env.TAIFA_MOBILE_SERVICE_NAME)),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Taifa Mobile error (${res.status})`);
  const raw = await res.json().catch(() => null);
  const r = (Array.isArray(raw) ? raw[0] : raw) as { messageId?: string; status?: string | number; statusDescription?: string } | null;
  if (!r) throw new Error("Taifa Mobile did not accept the message");
  const code = String(r.status ?? "").padStart(2, "0");
  if (code !== "00") throw new Error(`SMS not sent: ${TAIFA_STATUS[code] ?? r.statusDescription ?? `status ${code}`}`);
  return { mode: "live", provider: "taifa", to, status: r.statusDescription ?? "Success", messageId: r.messageId };
}

// ------------------------------------------------------------------ Africa's Talking

async function sendAfricasTalking(to: string, text: string): Promise<SmsResult> {
  const username = process.env.AFRICASTALKING_USERNAME!;
  const host = username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
  const body = new URLSearchParams({ username, to: `+${to}`, message: text });
  if (process.env.AFRICASTALKING_SENDER_ID) body.set("from", process.env.AFRICASTALKING_SENDER_ID);

  const res = await fetch(`https://${host}/version1/messaging`, {
    method: "POST",
    headers: {
      apiKey: process.env.AFRICASTALKING_API_KEY!,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`SMS gateway error (${res.status})`);
  const json = (await res.json()) as {
    SMSMessageData?: { Recipients?: { statusCode: number; status: string; messageId?: string; cost?: string }[] };
  };
  const r = json.SMSMessageData?.Recipients?.[0];
  if (!r) throw new Error("The SMS gateway did not accept the message");
  // 100–102 are Processed / Sent / Queued; everything else is a delivery refusal.
  if (r.statusCode < 100 || r.statusCode > 102) throw new Error(`SMS not sent: ${r.status}`);
  return { mode: "live", provider: "africastalking", to, status: r.status, messageId: r.messageId, cost: r.cost };
}
