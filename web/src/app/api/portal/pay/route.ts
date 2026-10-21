import { NextResponse } from "next/server";
import { DEMO_TOKEN } from "@/lib/pay-links";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { bearer, db, dbError } from "../_shared";

/** A pay link for one of the customer's own policies; the database decides the amount. */
export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { policyId?: string };
  if (!isSupabaseConfigured()) return NextResponse.json({ url: `/pay/${DEMO_TOKEN}` });
  if (!/^[0-9a-f-]{36}$/i.test(body.policyId ?? "")) return NextResponse.json({ error: "Unknown policy" }, { status: 400 });
  const { data, error } = await db().rpc("customer_pay_link", { p_token: token, p_policy_id: body.policyId });
  if (error) return dbError(error);
  return NextResponse.json({ url: `/pay/${data as string}` });
}
