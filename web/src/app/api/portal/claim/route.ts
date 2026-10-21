import { NextResponse } from "next/server";
import { money } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { kenyanMobile, sendSms } from "@/lib/sms";
import { bearer, db, dbError } from "../_shared";

/** A customer reports a claim; their agent gets an SMS straight away. */
export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    policyId?: string;
    date?: string;
    description?: string;
    location?: string;
    amount?: number | string;
  };
  const amount = body.amount === "" || body.amount == null ? null : Number(body.amount);
  if (amount != null && !Number.isFinite(amount)) return NextResponse.json({ error: "Enter the amount in shillings" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "")) return NextResponse.json({ error: "Pick the date it happened" }, { status: 400 });
  if ((body.description ?? "").trim().length < 10) {
    return NextResponse.json({ error: "Tell us what happened (at least a sentence)" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ number: `CLM-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 89999)}`, agentName: "Joseph Otieno", demo: true });
  }
  if (!/^[0-9a-f-]{36}$/i.test(body.policyId ?? "")) return NextResponse.json({ error: "Unknown policy" }, { status: 400 });

  const { data, error } = await db().rpc("customer_claim_create", {
    p_token: token,
    p_policy_id: body.policyId,
    p_incident_date: body.date,
    p_description: (body.description ?? "").slice(0, 1000),
    p_location: (body.location ?? "").slice(0, 200),
    p_amount: amount,
  });
  if (error) return dbError(error);
  const claim = data as { number: string; policy_number: string; agent_name: string | null; agent_phone: string | null };

  const agentPhone = claim.agent_phone ? kenyanMobile(claim.agent_phone) : null;
  if (agentPhone) {
    const what = (body.description ?? "").replace(/\s+/g, " ").replace(/[^\x20-\x7E]/g, "").slice(0, 90);
    await sendSms(
      agentPhone,
      `New Bimafy claim ${claim.number} on ${claim.policy_number}${amount ? `, ${money(amount)}` : ""}: "${what}". Please call the client today.`,
    ).catch(() => null);
  }
  return NextResponse.json({ number: claim.number, agentName: claim.agent_name });
}
