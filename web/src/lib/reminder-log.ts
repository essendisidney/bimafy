"use client";

import { useSyncExternalStore } from "react";

/**
 * Which reminders have gone out, kept on this device so the queue doesn't
 * ask an agent to message the same client twice. Every send is also posted
 * to Notifications.
 */

export type SentReminder = { at: string; channel: "sms" | "whatsapp" };

const KEY = "bimafy.reminders.sent";
const KEEP_DAYS = 120;
const EMPTY: Record<string, SentReminder> = {};

let log: Record<string, SentReminder> | null = null;
const listeners = new Set<() => void>();

function load(): Record<string, SentReminder> {
  if (log) return log;
  log = {};
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (raw) log = JSON.parse(raw) as Record<string, SentReminder>;
  } catch {
    // Private mode or bad JSON: start empty.
  }
  return log;
}

export function markReminderSent(key: string, channel: SentReminder["channel"]) {
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  const next: Record<string, SentReminder> = { [key]: { at: new Date().toISOString(), channel } };
  for (const [k, v] of Object.entries(load())) if (k !== key && Date.parse(v.at) >= cutoff) next[k] = v;
  log = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Still marked for this session.
  }
  listeners.forEach((l) => l());
}

export function useReminderLog() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    load,
    () => EMPTY,
  );
}
