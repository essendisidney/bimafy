import { msisdn } from "./engines/agency.ts";

/**
 * Outbound SMS. Taifa Mobile is used when TAIFA_API_KEY is set,
 * otherwise Africa's Talking (AFRICASTALKING_USERNAME / _API_KEY). With
 * neither, sends are simulated so demos and previews still work end to end.
 */

export const MAX_SMS_CHARS = 459; // three SMS parts

export type SmsProvider = "taifa" | "africastalking";

export function smsProvider(): SmsProvider | null {
  if (taifaApiKey()) return "taifa";
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

export const TAIFA_SMS_URL = "https://api.taifamobile.co.ke/v2/sms/sendsms";

/** Env value with surrounding whitespace and quotes removed. */
function envValue(name: string) {
  return (process.env[name] ?? "").trim().replace(/^["']|["']$/g, "").trim();
}

/** TAIFA_API_KEY, falling back to the older TAIFA_MOBILE_API_KEY name. */
export function taifaApiKey() {
  return envValue("TAIFA_API_KEY") || envValue("TAIFA_MOBILE_API_KEY");
}

/** Approved sender name; SIDNET is the only one on the account. */
export function taifaSender() {
  return envValue("TAIFA_MOBILE_SERVICE_NAME") || envValue("TAIFA_SENDER_ID") || "SIDNET";
}

/** The JSON body Taifa Mobile's v2 /sms/sendsms endpoint takes. */
export function taifaBody(to: string, message: string, senderName: string) {
  return { mobile: to, sender_name: senderName, message, response_type: "json" };
}

/** null when Taifa accepted the message (status 1000), otherwise why it didn't. */
export function taifaRejection(text: string): string | null {
  let row: { status_code?: string | number; status_desc?: string } | undefined;
  try {
    const parsed = JSON.parse(text) as unknown;
    row = (Array.isArray(parsed) ? parsed[0] : parsed) as typeof row;
  } catch {
    return `Bad response from Taifa: ${text.slice(0, 120)}`;
  }
  const code = String(row?.status_code ?? "");
  if (code === "1000") return null;
  return `Taifa ${code || "?"}: ${row?.status_desc ?? text.slice(0, 120)}`;
}

async function sendTaifa(to: string, text: string): Promise<SmsResult> {
  let body: string;
  try {
    // TAIFA_MOBILE_URL only exists to point tests at a stand-in server.
    const res = await fetch(process.env.TAIFA_MOBILE_URL || TAIFA_SMS_URL, {
      method: "POST",
      headers: { h_api_key: taifaApiKey(), "Content-Type": "application/json" },
      body: JSON.stringify(taifaBody(to, text, taifaSender())),
      signal: AbortSignal.timeout(20_000),
    });
    body = await res.text();
  } catch (e) {
    throw new Error(`Taifa unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }
  const err = taifaRejection(body);
  if (err) throw new Error(err);
  const raw = JSON.parse(body) as unknown;
  const r = (Array.isArray(raw) ? raw[0] : raw) as { message_id?: string | number; status_desc?: string };
  return {
    mode: "live",
    provider: "taifa",
    to,
    status: r.status_desc ?? "Success",
    messageId: r.message_id == null ? undefined : String(r.message_id),
  };
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
