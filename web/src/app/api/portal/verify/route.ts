import { NextResponse } from "next/server";
import { DEMO_CODE, DEMO_PORTAL_TOKEN } from "@/lib/portal";
import { kenyanMobile } from "@/lib/sms";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { db, dbError } from "../_shared";

/** Step 2: swap the SMS code for a 30-day session token. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: string; code?: string };
  const phone = kenyanMobile(body.phone ?? "");
  const code = (body.code ?? "").replace(/\D/g, "");
  if (!phone || code.length !== 6) return NextResponse.json({ error: "Enter the 6-digit code from the SMS" }, { status: 400 });
  if (!isSupabaseConfigured()) {
    return code === DEMO_CODE
      ? NextResponse.json({ token: DEMO_PORTAL_TOKEN })
      : NextResponse.json({ error: `Demo mode: the code is ${DEMO_CODE}` }, { status: 400 });
  }
  const { data, error } = await db().rpc("customer_otp_verify", { p_phone: phone, p_code: code });
  if (error) return dbError(error);
  return NextResponse.json({ token: data as string });
}
