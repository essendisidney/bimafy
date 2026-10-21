import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/config";

export function db() {
  const { url, key } = getSupabaseEnv();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The session token from "Authorization: Bearer <token>". */
export function bearer(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const t = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  return /^[a-f0-9]{64}$|^demo$/.test(t) ? t : "";
}

/** Our own validation/limit messages are written for customers; anything else isn't shown. */
export function dbError(error: { code?: string; message: string }) {
  if (error.code === "42501") return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  const mine = error.code === "22023" || error.code === "P0001";
  return NextResponse.json(
    { error: mine ? error.message : "Something went wrong — please try again" },
    { status: mine ? (error.code === "P0001" ? 429 : 400) : 502 },
  );
}
