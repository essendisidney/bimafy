"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Which reminders have gone out. With Supabase this is the agency-wide
 * reminder_log table (so two agents, or an agent and the 8am auto-send, never
 * message the same client twice); in demo mode it lives on this device.
 */

export type SentReminder = {
  at: string;
  channel: "sms" | "whatsapp";
  automatic?: boolean;
  status?: "sending" | "sent" | "failed";
};

const KEY = "bimafy.reminders.sent";
const KEEP_DAYS = 120;
const EMPTY: Record<string, SentReminder> = {};

let log: Record<string, SentReminder> | null = null;
/** Marks made on this screen before the database answers, so the UI doesn't flicker back. */
const pendingLocal: Record<string, SentReminder> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load(): Record<string, SentReminder> {
  if (log) return log;
  log = {};
  if (isSupabaseConfigured()) return log;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (raw) log = JSON.parse(raw) as Record<string, SentReminder>;
  } catch {
    // Private mode or bad JSON: start empty.
  }
  return log;
}

async function refreshFromDb() {
  const since = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const { data, error } = await createClient()
    .from("reminder_log")
    .select("key, channel, status, automatic, sent_at")
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(2000);
  if (error) return;
  const next: Record<string, SentReminder> = {};
  for (const r of (data ?? []) as { key: string; channel: SentReminder["channel"]; status: SentReminder["status"]; automatic: boolean; sent_at: string }[]) {
    // A failed automatic send is still owed: leave it in the queue.
    if (r.status === "failed") continue;
    next[r.key] = { at: r.sent_at, channel: r.channel, automatic: r.automatic, status: r.status };
  }
  log = { ...next, ...pendingLocal };
  emit();
}

export async function markReminderSent(
  key: string,
  channel: SentReminder["channel"],
  meta: { policyId?: string; kind?: string; messageId?: string } = {},
) {
  const row: SentReminder = { at: new Date().toISOString(), channel, status: "sent" };
  log = { ...load(), [key]: row };
  emit();

  if (isSupabaseConfigured()) {
    pendingLocal[key] = row;
    const uuid = meta.policyId && /^[0-9a-f-]{36}$/i.test(meta.policyId) ? meta.policyId : null;
    await createClient().rpc("reminder_mark_sent", {
      p_key: key,
      p_policy_id: uuid,
      p_kind: meta.kind ?? key.split(":")[1] ?? "reminder",
      p_channel: channel,
      p_provider_message_id: meta.messageId ?? null,
    });
    return;
  }

  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  const kept: Record<string, SentReminder> = {};
  for (const [k, v] of Object.entries(log)) if (Date.parse(v.at) >= cutoff) kept[k] = v;
  log = kept;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Still marked for this session.
  }
}

export function useReminderLog() {
  useEffect(() => {
    // Fresh on every visit: another agent or the 8am run may have sent some since.
    if (isSupabaseConfigured()) void refreshFromDb();
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    load,
    () => EMPTY,
  );
}
