import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { eatDay, reminderQueue, type Reminder } from "@/lib/engines/reminders";
import { siteUrl } from "@/lib/claim-messages";
import { reminderLinkNote, reminderMessage } from "@/lib/i18n/reminders";
import { feedPolicies, type ReminderFeed } from "@/lib/reminders-feed";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/config";
import { isSmsLiveConfigured, sendSms, smsProvider } from "@/lib/sms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Most reminders one morning run will send; the rest wait for tomorrow's (still fresh) run. */
const MAX_PER_RUN = 200;
const CONCURRENCY = 4;

/**
 * The morning reminder run (Vercel Cron, see vercel.json). Works out who is
 * due a renewal or instalment reminder today and texts them, unless an agent
 * already did. Sends only when REMINDERS_AUTO_SEND=true and an SMS provider
 * is configured; otherwise it reports what it would have sent.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const { url, key } = getSupabaseEnv();
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("reminders_feed", { p_secret: secret });
  if (error) {
    const status = error.code === "42501" ? 403 : 502;
    return NextResponse.json(
      { error: status === 403 ? "The database doesn't know this CRON_SECRET (set private.app_secrets 'reminders_cron')" : error.message },
      { status },
    );
  }

  const feed = feedPolicies(data as ReminderFeed);
  const today = eatDay(new Date());
  const queue = reminderQueue({ policies: feed.policies, payments: feed.payments, today, sent: feed.sent });
  const lang = process.env.REMINDERS_LANG === "sw" ? "sw" : "en";
  const withPhone = queue.due.filter((r) => feed.phones.get(r.policy.id));
  const batch = withPhone.slice(0, MAX_PER_RUN);

  const live =
    process.env.REMINDERS_AUTO_SEND === "true" && isSmsLiveConfigured() && new URL(request.url).searchParams.get("dry") !== "1";
  const summary = {
    today,
    mode: live ? "live" : "dry_run",
    provider: smsProvider(),
    due: queue.due.length,
    noPhone: queue.due.length - withPhone.length,
    deferred: withPhone.length - batch.length,
    sent: 0,
    failed: 0,
    alreadyHandled: 0,
    kinds: countBy(queue.due.map((r) => r.kind)),
  };
  if (!live) return NextResponse.json(summary);
  const site = siteUrl(request.url);

  const send = async (r: Reminder) => {
    const { data: claimed, error: claimError } = await db.rpc("reminders_claim", {
      p_secret: secret,
      p_key: r.key,
      p_policy_id: r.policy.id,
      p_kind: r.kind,
    });
    if (claimError) {
      summary.failed++;
      return;
    }
    if (!claimed) {
      summary.alreadyHandled++;
      return;
    }
    // A pay link lets the customer pay from the SMS; if it can't be made, send the reply-YES text.
    const { data: token } = await db.rpc("reminders_pay_link", {
      p_secret: secret,
      p_policy_id: r.policy.id,
      p_amount: r.amount,
      p_purpose: r.track === "instalment" ? "instalment" : "renewal",
      p_note: reminderLinkNote(r),
    });
    const payUrl = typeof token === "string" ? `${site}/pay/${token}` : null;
    const text = reminderMessage(lang, r, feed.agentNames.get(r.policy.id)?.split(" ")[0] ?? "Bimafy", payUrl);
    try {
      const sms = await sendSms(feed.phones.get(r.policy.id)!, text);
      summary.sent++;
      await db.rpc("reminders_finish", {
        p_secret: secret, p_key: r.key, p_ok: true, p_provider: sms.provider, p_message_id: sms.messageId ?? null, p_error: null,
      });
    } catch (err) {
      summary.failed++;
      await db.rpc("reminders_finish", {
        p_secret: secret, p_key: r.key, p_ok: false, p_provider: smsProvider(), p_message_id: null,
        p_error: err instanceof Error ? err.message : "SMS failed",
      });
    }
  };

  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    await Promise.all(batch.slice(i, i + CONCURRENCY).map(send));
  }
  return NextResponse.json(summary);
}

function countBy(items: string[]) {
  const out: Record<string, number> = {};
  for (const k of items) out[k] = (out[k] ?? 0) + 1;
  return out;
}
