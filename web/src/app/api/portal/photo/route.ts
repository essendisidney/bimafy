import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { bearer, db, dbError } from "../_shared";

/**
 * Claim photos from /my, in two steps around a direct upload to storage:
 *   POST {claimNumber, ext}         → a single-use storage path for one photo
 *   PUT  {claimNumber, path}        → record it once the file has arrived
 */
const CLAIM = /^CLM-\d{4}-\d{3,6}$/;

export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { claimNumber?: string; ext?: string };
  if (!CLAIM.test(body.claimNumber ?? "")) return NextResponse.json({ error: "Unknown claim" }, { status: 400 });
  const ext = ["jpg", "png", "webp"].includes(body.ext ?? "") ? body.ext : "jpg";
  if (!isSupabaseConfigured()) return NextResponse.json({ path: `demo/${crypto.randomUUID()}.${ext}`, demo: true });
  const { data, error } = await db().rpc("customer_claim_upload_slot", { p_token: token, p_claim_number: body.claimNumber, p_ext: ext });
  if (error) return dbError(error);
  return NextResponse.json({ path: data as string });
}

export async function PUT(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { claimNumber?: string; path?: string };
  if (!CLAIM.test(body.claimNumber ?? "") || !/^[0-9a-z/-]+\.(jpg|png|webp)$/i.test(body.path ?? "")) {
    return NextResponse.json({ error: "Unknown photo" }, { status: 400 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ photos: null, demo: true });
  const { data, error } = await db().rpc("customer_claim_photo_done", { p_token: token, p_claim_number: body.claimNumber, p_path: body.path });
  if (error) return dbError(error);
  return NextResponse.json({ photos: data as number });
}
