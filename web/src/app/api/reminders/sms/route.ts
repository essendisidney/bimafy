import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { isSmsLiveConfigured, sendSms } from "@/lib/sms";

const STAFF = new Set(["agent", "admin", "branch_manager", "call_center", "finance"]);

/**
 * Send one client reminder by SMS. Only signed-in staff can send: every
 * message costs the agency money and goes out under its sender name.
 */
export async function POST(request: Request) {
  let body: { phone?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON with phone and message" }, { status: 400 });
  }
  if (!body.phone || !body.message) {
    return NextResponse.json({ error: "phone and message are required" }, { status: 400 });
  }

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Sign in to send reminders" }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
    if (!profile || !STAFF.has(profile.role as string)) {
      return NextResponse.json({ error: "Only agency staff can send reminders" }, { status: 403 });
    }
  } else if (isSmsLiveConfigured()) {
    // A demo deployment with no sign-in must never spend real SMS credit.
    return NextResponse.json({ error: "Live SMS needs sign-in (configure Supabase)" }, { status: 403 });
  }

  try {
    const result = await sendSms(body.phone, body.message);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SMS failed";
    const status = /number|empty|characters/i.test(message) ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
