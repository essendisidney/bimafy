import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { initiateStkPush } from "@/lib/mpesa/daraja";
import { savePendingStk } from "@/lib/mpesa/pending";
import { DEMO_TOKEN, DEMO_VIEW, isPayToken, type PayLinkView } from "@/lib/pay-links";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/config";
import { kenyanMobile } from "@/lib/sms";

export const dynamic = "force-dynamic";

function db() {
  const { url, key } = getSupabaseEnv();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function view(token: string): Promise<PayLinkView | null> {
  if (!isSupabaseConfigured()) return token === DEMO_TOKEN ? DEMO_VIEW : null;
  if (!isPayToken(token)) return null;
  const { data, error } = await db().rpc("pay_link_view", { p_token: token });
  if (error) throw new Error(error.message);
  return (data as PayLinkView | null) ?? null;
}

/** What the pay page shows. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  try {
    const link = await view(token);
    if (!link) return NextResponse.json({ error: "This payment link doesn't exist" }, { status: 404 });
    return NextResponse.json(link, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load this payment link" }, { status: 502 });
  }
}

/** Send the M-Pesa prompt for the link's amount (never an amount from the browser). */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const phone = kenyanMobile(body.phone ?? "");
  if (!phone) return NextResponse.json({ error: "Enter the M-Pesa number to charge (07… or 01…)" }, { status: 400 });

  let link: PayLinkView | null;
  try {
    link = await view(token);
  } catch {
    return NextResponse.json({ error: "Couldn't load this payment link" }, { status: 502 });
  }
  if (!link) return NextResponse.json({ error: "This payment link doesn't exist" }, { status: 404 });
  if (link.status === "paid") return NextResponse.json({ error: "This has already been paid — thank you!" }, { status: 409 });
  if (link.status === "expired") return NextResponse.json({ error: "This link has expired — ask your agent for a new one" }, { status: 410 });

  try {
    const result = await initiateStkPush({
      phone,
      amount: Number(link.amount),
      accountReference: link.policy_number.replace(/[^A-Za-z0-9]/g, "").slice(0, 12),
      description: "Bimafy cover",
    });
    const pending = await savePendingStk(result, {
      policyId: link.policy_id,
      policyNumber: link.policy_number,
      participantName: link.first_name,
    });
    if (isSupabaseConfigured()) {
      const { data: attached } = await db().rpc("pay_link_attach", { p_token: token, p_checkout_request_id: result.checkoutRequestId });
      if (!attached) return NextResponse.json({ error: "This link can't be paid right now — please try again" }, { status: 409 });
    }
    return NextResponse.json({ checkoutRequestId: pending.checkoutRequestId, mode: result.mode, message: result.customerMessage });
  } catch (err) {
    const message = err instanceof Error ? err.message : "M-Pesa request failed";
    return NextResponse.json({ error: message }, { status: /phone|amount|KES/i.test(message) ? 400 : 502 });
  }
}
