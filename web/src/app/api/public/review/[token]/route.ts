import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPayToken } from "@/lib/pay-links";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export type ReviewInvite = {
  status: "open" | "used" | "expired";
  agent_name: string;
  agent_slug: string | null;
  first_name: string | null;
  product_name: string | null;
};

const DEMO: ReviewInvite = { status: "open", agent_name: "Joseph Otieno", agent_slug: "joseph-otieno", first_name: "Amina", product_name: "Motor Comprehensive Takaful" };

function db() {
  const { url, key } = getSupabaseEnv();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!isSupabaseConfigured()) return token === "demo" ? NextResponse.json(DEMO) : NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isPayToken(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await db().rpc("review_invite_view", { p_token: token });
  if (error) return NextResponse.json({ error: "Couldn't load this review link" }, { status: 502 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  let body: { rating?: number; comment?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const rating = Math.round(Number(body.rating));
  if (!(rating >= 1 && rating <= 5)) return NextResponse.json({ error: "Choose 1 to 5 stars" }, { status: 400 });
  const comment = typeof body.comment === "string" ? body.comment.slice(0, 500) : "";
  if (!isSupabaseConfigured()) return token === "demo" ? NextResponse.json({ ok: true, demo: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isPayToken(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { error } = await db().rpc("review_submit", { p_token: token, p_rating: rating, p_comment: comment });
  if (error) {
    const mine = error.code === "22023" || error.code === "P0001";
    return NextResponse.json({ error: mine ? error.message : "Couldn't save your review — please try again" }, { status: mine ? 409 : 502 });
  }
  return NextResponse.json({ ok: true });
}
