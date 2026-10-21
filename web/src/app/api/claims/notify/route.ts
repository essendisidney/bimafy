import { NextResponse } from "next/server";
import { claimStepMessage, NOTIFY_STEPS, siteUrl, type ClaimStepInfo } from "@/lib/claim-messages";
import { kenyanMobile, sendSms } from "@/lib/sms";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff moved a claim to a new step: record it once (public.claim_step) and,
 * for steps the customer cares about, text them. Runs as the signed-in staff
 * member, so the database checks they may touch this claim.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { claimId?: string; status?: string };
  if (!body.status || !body.claimId) return NextResponse.json({ error: "claimId and status are required" }, { status: 400 });
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, demo: true, texted: false });
  if (!/^[0-9a-f-]{36}$/i.test(body.claimId)) return NextResponse.json({ ok: true, texted: false });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_step", { p_claim_id: body.claimId, p_status: body.status });
  if (error) {
    const status = error.code === "42501" ? 403 : 502;
    return NextResponse.json({ error: status === 403 ? "Not allowed" : "Couldn't record the step" }, { status });
  }
  const info = data as ClaimStepInfo | null;
  // null: this step was already recorded, so the customer has already been told.
  if (!info || !(NOTIFY_STEPS as readonly string[]).includes(body.status)) return NextResponse.json({ ok: true, texted: false });

  const phone = info.phone ? kenyanMobile(info.phone) : null;
  const text = claimStepMessage(body.status, info, siteUrl(req.url));
  if (!phone || !text) return NextResponse.json({ ok: true, texted: false });
  try {
    const sms = await sendSms(phone, text);
    await supabase.rpc("claim_step_notified", { p_claim_id: body.claimId, p_status: body.status });
    return NextResponse.json({ ok: true, texted: true, mode: sms.mode });
  } catch (err) {
    return NextResponse.json({ ok: true, texted: false, error: err instanceof Error ? err.message : "SMS failed" });
  }
}
