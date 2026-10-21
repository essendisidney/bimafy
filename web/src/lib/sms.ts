import { msisdn } from "./engines/agency";

/**
 * Outbound SMS through Africa's Talking (the usual Kenyan SMS gateway).
 * Without AFRICASTALKING_USERNAME / AFRICASTALKING_API_KEY nothing is sent;
 * the call is simulated so demos and previews still work end to end.
 */

export const MAX_SMS_CHARS = 459; // three SMS parts

export function isSmsLiveConfigured() {
  return Boolean(process.env.AFRICASTALKING_USERNAME && process.env.AFRICASTALKING_API_KEY);
}

/** +2547XXXXXXXX / +2541XXXXXXXX, or null when it isn't a Kenyan mobile number. */
export function kenyanMobile(phone: string) {
  const digits = msisdn(phone);
  return /^254[17]\d{8}$/.test(digits) ? `+${digits}` : null;
}

export type SmsResult = { mode: "live" | "simulated"; to: string; status: string; messageId?: string; cost?: string };

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  const to = kenyanMobile(phone);
  if (!to) throw new Error("Enter a Kenyan mobile number (07… or 01…)");
  const text = message.trim();
  if (!text) throw new Error("The message is empty");
  if (text.length > MAX_SMS_CHARS) throw new Error(`Keep the message under ${MAX_SMS_CHARS} characters`);

  if (!isSmsLiveConfigured()) return { mode: "simulated", to, status: "Simulated" };

  const username = process.env.AFRICASTALKING_USERNAME!;
  const host = username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
  const body = new URLSearchParams({ username, to, message: text });
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
  return { mode: "live", to, status: r.status, messageId: r.messageId, cost: r.cost };
}
