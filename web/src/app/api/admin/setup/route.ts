import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/claim-messages";
import { goLiveChecklist, type DbFacts, type ServerFacts } from "@/lib/go-live";
import { isMpesaLiveConfigured } from "@/lib/mpesa/daraja";
import { kenyanMobile, sendSms, smsProvider } from "@/lib/sms";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const sha = (v?: string) => (v ? createHash("sha256").update(v).digest("hex") : null);

/** Facts only the server knows. Never the secret values themselves. */
function serverFacts(req: Request): ServerFacts {
  return {
    database: isSupabaseConfigured(),
    smsProvider: smsProvider(),
    cronSecretSet: (process.env.CRON_SECRET ?? "").length >= 24,
    autoSend: process.env.REMINDERS_AUTO_SEND === "true",
    remindersLang: process.env.REMINDERS_LANG === "sw" ? "sw" : "en",
    mpesaLive: isMpesaLiveConfigured(),
    mpesaEnv: process.env.MPESA_ENV === "production" ? "production" : "sandbox",
    mpesaCallbackSecretSet: Boolean(process.env.MPESA_CALLBACK_SECRET),
    siteUrl: siteUrl(req.url),
  };
}

async function dbFacts(): Promise<{ facts: DbFacts | null; status: number }> {
  if (!isSupabaseConfigured()) return { facts: null, status: 200 };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("setup_status", {
    p_cron_hash: sha(process.env.CRON_SECRET),
    p_mpesa_hash: sha(process.env.MPESA_CALLBACK_SECRET),
  });
  if (error) return { facts: null, status: error.code === "42501" ? 403 : 502 };
  return { facts: data as DbFacts, status: 200 };
}

export async function GET(req: Request) {
  const { facts, status } = await dbFacts();
  if (status !== 200) return NextResponse.json({ error: status === 403 ? "Admins only" : "Couldn't read the database" }, { status });
  const server = serverFacts(req);
  return NextResponse.json({ checks: goLiveChecklist(server, facts), adminPhone: facts?.admin_phone ?? null });
}

/** One-click fixes: register a server secret with the database, or send a test SMS. Admins only. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; phone?: string };
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Connect the database first" }, { status: 400 });
  const supabase = await createClient();

  if (body.action === "connect_cron" || body.action === "connect_mpesa") {
    const value = body.action === "connect_cron" ? process.env.CRON_SECRET : process.env.MPESA_CALLBACK_SECRET;
    if (!value) return NextResponse.json({ error: "That secret isn't set on the server yet" }, { status: 400 });
    const { error } = await supabase.rpc("admin_register_secret", {
      p_name: body.action === "connect_cron" ? "reminders_cron" : "mpesa_callback",
      p_secret: value,
    });
    if (error) {
      const mine = error.code === "42501" || error.code === "22023";
      return NextResponse.json({ error: mine ? error.message : "Couldn't save it" }, { status: error.code === "42501" ? 403 : 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "test_sms") {
    // Same admin check as the checklist itself.
    const { error } = await supabase.rpc("setup_status", { p_cron_hash: null, p_mpesa_hash: null });
    if (error) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    const phone = kenyanMobile(body.phone ?? "");
    if (!phone) return NextResponse.json({ error: "Enter your Kenyan mobile number" }, { status: 400 });
    try {
      const r = await sendSms(phone, "Bimafy test: your SMS sending works. Customers will get reminders, codes and claim updates like this.");
      return NextResponse.json({ ok: true, mode: r.mode, status: r.status });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "SMS failed" }, { status: 502 });
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
