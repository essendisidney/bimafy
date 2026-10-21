import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { bearer, db } from "../_shared";

export async function POST(req: Request) {
  const token = bearer(req);
  if (token && isSupabaseConfigured()) await db().rpc("customer_logout", { p_token: token });
  return NextResponse.json({ ok: true });
}
