import { createHash, randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { codeMessage } from "@/lib/portal";
import { kenyanMobile, sendSms } from "@/lib/sms";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { db, dbError } from "../_shared";

/**
 * Step 1 of customer sign-in: text a 6-digit code to the number. The reply is
 * the same whether or not the number has a policy, so nobody can use this to
 * find out who our customers are.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  const phone = kenyanMobile(body.phone ?? "");
  if (!phone) return NextResponse.json({ error: "Enter a Kenyan mobile number (07… or 01…)" }, { status: 400 });
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, demo: true });

  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Sign-in by SMS isn't switched on yet — please call your agent" }, { status: 503 });

  const code = String(randomInt(100000, 1000000));
  const hash = createHash("sha256").update(`${phone}:${code}`).digest("hex");
  const { data: known, error } = await db().rpc("customer_otp_issue", { p_secret: secret, p_phone: phone, p_code_hash: hash });
  if (error) return dbError(error);
  if (known) {
    try {
      await sendSms(phone, codeMessage(code));
    } catch {
      return NextResponse.json({ error: "We couldn't send the SMS — please try again" }, { status: 502 });
    }
  }
  return NextResponse.json({ ok: true });
}
