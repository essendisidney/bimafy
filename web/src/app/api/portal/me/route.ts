import { NextResponse } from "next/server";
import { DEMO_PORTAL_TOKEN, demoPortal } from "@/lib/portal";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { bearer, db, dbError } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return token === DEMO_PORTAL_TOKEN ? NextResponse.json(demoPortal()) : NextResponse.json({ error: "Please sign in" }, { status: 401 });
  }
  const { data, error } = await db().rpc("customer_portal", { p_token: token });
  if (error) return dbError(error);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
