"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { defaultOperatorId, isUuid } from "@/lib/ids";
import { applyPending, drain, enqueue, isNetworkError, readQueue, type OutboxOp, type QueuedOp, type SendResult } from "@/lib/outbox";
import { platformStore, usePlatform } from "@/lib/store";
import type { Agent, Broker, Lead, LeadActivity, LeadSource, LeadStatus, ProductLine } from "@/lib/types";

/**
 * Lead book. Demo mode keeps leads in the local platform store. When Supabase
 * is configured AND the user has a real Supabase session, leads live in the
 * `leads` table (RLS scopes agents/brokers to their own rows) and this module
 * holds an optimistic in-memory copy. Local personas (no session) stay on demo
 * data, since RLS would hide every row from them.
 *
 * Offline: the last server copy is cached per user, and writes made without a
 * connection go to an outbox (lib/outbox.ts) that replays in order when the
 * connection returns. Only network failures are queued; real rejections (RLS,
 * validation) still roll back and show an error.
 */

export type DbLead = {
  id: string;
  operator_id: string;
  agent_id: string | null;
  broker_id: string | null;
  full_name: string;
  phone: string | null;
  product_line: string | null;
  status: string;
  notes: string | null;
  estimated_value: number | string | null;
  source: string | null;
  next_action_at: string | null;
  lost_reason: string | null;
  activities: LeadActivity[] | null;
  created_at: string;
};

export function mapLead(row: DbLead): Lead {
  return {
    id: row.id,
    name: row.full_name,
    phone: row.phone ?? "",
    productLine: (row.product_line ?? "motor") as ProductLine,
    status: row.status as LeadStatus,
    agentId: row.agent_id ?? undefined,
    brokerId: row.broker_id ?? undefined,
    notes: row.notes ?? "",
    value: row.estimated_value == null ? undefined : Number(row.estimated_value),
    source: (row.source ?? undefined) as LeadSource | undefined,
    createdAt: row.created_at,
    nextActionAt: row.next_action_at ?? undefined,
    lostReason: row.lost_reason ?? undefined,
    activities: row.activities ?? [],
  };
}

export function leadRow(lead: Lead, operatorId: string) {
  return {
    id: lead.id,
    operator_id: operatorId,
    agent_id: isUuid(lead.agentId) ? lead.agentId : null,
    broker_id: isUuid(lead.brokerId) ? lead.brokerId : null,
    full_name: lead.name,
    phone: lead.phone || null,
    product_line: lead.productLine,
    status: lead.status,
    notes: lead.notes || null,
    estimated_value: lead.value ?? null,
    source: lead.source ?? null,
    next_action_at: lead.nextActionAt ?? null,
    lost_reason: lead.lostReason ?? null,
    activities: lead.activities ?? [],
  };
}

function patchRow(patch: Partial<Lead>) {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.value !== undefined) row.estimated_value = patch.value;
  if (patch.nextActionAt !== undefined) row.next_action_at = patch.nextActionAt;
  if (patch.lostReason !== undefined) row.lost_reason = patch.lostReason;
  if (patch.productLine !== undefined) row.product_line = patch.productLine;
  return row;
}

/** Supabase user id whose leads are live in this tab, if any. */
let remoteUser: string | null = null;
const remote = () => remoteUser !== null;

function isRemoteSession(userId?: string | null) {
  return isSupabaseConfigured() && isUuid(userId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sb(): any {
  return createClient();
}

type Snapshot = {
  leads: Lead[];
  loading: boolean;
  error: string | null;
  /** Writes waiting in the outbox for a connection. */
  pending: number;
  /** The last load fell back to the cached copy because the network was down. */
  offline: boolean;
};
let snapshot: Snapshot = { leads: [], loading: false, error: null, pending: 0, offline: false };
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => snapshot;

/** Lead changes saved on this device that haven't reached the server yet. */
export const pendingLeadWrites = () => snapshot.pending;

// ---------------------------------------------------------------- offline

const outboxKey = () => `insurax.outbox.${remoteUser}`;
const cacheKey = () => `insurax.leads.${remoteUser}`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function queued(): QueuedOp[] {
  const s = storage();
  return s && remoteUser ? readQueue(s, outboxKey()) : [];
}

function cacheRows(rows: Lead[]) {
  try {
    storage()?.setItem(cacheKey(), JSON.stringify(rows));
  } catch {
    // Quota or blocked storage: offline view just won't have the latest copy.
  }
}

function cachedRows(): Lead[] {
  try {
    const raw = storage()?.getItem(cacheKey());
    return raw ? (JSON.parse(raw) as Lead[]) : [];
  } catch {
    return [];
  }
}

const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

/** Queue a write for later and keep the optimistic copy on screen. */
function queue(op: OutboxOp) {
  const s = storage();
  if (!s || !remoteUser) return false;
  const ops = enqueue(s, outboxKey(), op);
  set({ pending: ops.length, error: null });
  return true;
}

async function send(op: OutboxOp): Promise<SendResult> {
  if (op.kind === "create") {
    const { error } = await sb().from("leads").insert(leadRow(op.lead, op.operatorId));
    if (!error) return { status: "ok" };
    if (isNetworkError(error)) return { status: "retry" };
    // Already there: an earlier attempt landed but its response was lost.
    if (error.code === "23505") return { status: "ok" };
    return { status: "drop", reason: `Lead not saved: ${error.message}` };
  }
  if (op.kind === "update") {
    // RLS hides rows it denies, so a blocked update is "0 rows", not an error.
    const { data, error } = await sb().from("leads").update(patchRow(op.patch)).eq("id", op.id).select("id");
    if (error) return isNetworkError(error) ? { status: "retry" } : { status: "drop", reason: `Lead not updated: ${error.message}` };
    return data?.length ? { status: "ok" } : { status: "drop", reason: "Lead not updated: you no longer have access to it." };
  }
  const { data, error } = await sb().rpc("log_lead_activity", {
    p_lead_id: op.id,
    p_activity: op.activity,
    p_patch: patchRow(op.patch),
  });
  if (error) return isNetworkError(error) ? { status: "retry" } : { status: "drop", reason: `Activity not saved: ${error.message}` };
  return data?.length ? { status: "ok" } : { status: "drop", reason: "Activity not saved: you no longer have access to this lead." };
}

let draining: Promise<void> | null = null;

/** Replay queued writes (oldest first). Safe to call often; runs one drain at a time. */
export function syncOutbox() {
  const s = storage();
  if (!remote() || !s || !isOnline()) return Promise.resolve();
  if (draining) return draining;
  const key = outboxKey();
  draining = (async () => {
    try {
      const { remaining, dropped } = await drain(s, key, (op) => send(op).catch(() => ({ status: "retry" as const })));
      set({ pending: remaining, ...(dropped.length ? { error: dropped.map((d) => d.reason).join(" · ") } : {}) });
    } finally {
      draining = null;
    }
  })();
  return draining;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void syncOutbox().then(() => refreshLeads());
  });
}

export async function refreshLeads() {
  if (!remote()) return;
  loadedFor = remoteUser;
  set({ loading: true });
  await syncOutbox();
  // Known offline: don't sit through the client's retry backoff, go straight to the saved copy.
  const { data, error } = isOnline()
    ? await sb().from("leads").select("*").order("created_at", { ascending: false })
    : { data: null, error: { message: "offline" } };
  const pending = queued();
  if (error && (!isOnline() || isNetworkError(error))) {
    // No connection: show the last server copy plus anything queued since.
    set({ loading: false, error: null, offline: true, pending: pending.length, leads: applyPending(cachedRows(), pending) });
  } else if (error) {
    set({ loading: false, error: error.message, pending: pending.length });
  } else {
    const rows = (data ?? []).map((r: DbLead) => mapLead(r));
    cacheRows(rows);
    set({ loading: false, error: null, offline: false, pending: pending.length, leads: applyPending(rows, pending) });
  }
}

export function useLeads() {
  const demo = usePlatform();
  const { user } = useAuth();
  const live = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const userId = isRemoteSession(user?.id) ? user!.id : null;
  const mode = userId ? ("supabase" as const) : ("demo" as const);

  useEffect(() => {
    remoteUser = userId;
    if (!userId) return;
    if (loadedFor !== userId) {
      set({ leads: [], error: null, pending: 0, offline: false });
      void refreshLeads();
    }
  }, [userId]);

  if (mode === "demo") return { leads: demo.leads, loading: false, error: null, pending: 0, offline: false, mode };
  return { ...live, mode };
}

/**
 * Outbox status for the app chrome: how many lead changes are waiting for a
 * connection. Drains anything left from an earlier visit without loading leads.
 */
export function useLeadSync() {
  const { user } = useAuth();
  const live = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const userId = isRemoteSession(user?.id) ? user!.id : null;

  useEffect(() => {
    if (!userId) return;
    if (remoteUser !== userId) {
      remoteUser = userId;
      loadedFor = null;
    }
    set({ pending: queued().length });
    void syncOutbox();
  }, [userId]);

  return userId ? { pending: live.pending, error: live.error } : { pending: 0, error: null };
}

/** Lead ids are UUIDs once they go to Postgres. */
export function newLeadId() {
  return remote() ? crypto.randomUUID() : `ld-${crypto.randomUUID().slice(0, 8)}`;
}

/** The id leads are stored against for a distributor in the current backend. */
export function distributorKey(d: Pick<Agent | Broker, "id" | "dbId">) {
  return remote() && d.dbId ? d.dbId : d.id;
}

export function ownsLead(d: Pick<Agent | Broker, "id" | "dbId">, id?: string) {
  return Boolean(id) && (id === d.id || id === d.dbId);
}

/** Roll back the optimistic write and surface the error; returns false for callers. */
function fail(message: string, rollback: Lead[]) {
  set({ leads: rollback, error: message });
  return false;
}

/**
 * Send now if we can; queue on no connection or a network failure; roll back
 * and surface anything the server actually rejected.
 */
async function write(op: OutboxOp, before: Lead[]) {
  // Earlier queued writes go first so the server sees them in order.
  if (snapshot.pending > 0) await syncOutbox();
  if (!isOnline() || snapshot.pending > 0) return queue(op) || fail("Offline and unable to queue this change.", before);
  const result = await send(op).catch(() => ({ status: "retry" as const }));
  if (result.status === "ok") return true;
  if (result.status === "retry") return queue(op) || fail("Offline and unable to queue this change.", before);
  return fail(result.reason, before);
}

export async function createLead(lead: Lead, operatorId?: string | null) {
  if (!remote()) {
    platformStore.addLead(lead);
    return true;
  }
  const before = snapshot.leads;
  set({ leads: [lead, ...before], error: null });
  return write({ kind: "create", lead, operatorId: operatorId ?? defaultOperatorId() }, before);
}

export async function createLeads(rows: Lead[], operatorId?: string | null) {
  if (!remote()) {
    rows.forEach((l) => platformStore.addLead(l));
    return true;
  }
  const before = snapshot.leads;
  set({ leads: [...rows, ...before], error: null });
  const op = operatorId ?? defaultOperatorId();
  for (const lead of rows) {
    if (!(await write({ kind: "create", lead, operatorId: op }, before))) return false;
  }
  return true;
}

export async function updateLead(id: string, patch: Partial<Lead>) {
  if (!remote()) {
    platformStore.updateLead(id, patch);
    return true;
  }
  const before = snapshot.leads;
  set({ leads: before.map((l) => (l.id === id ? { ...l, ...patch } : l)), error: null });
  return write({ kind: "update", id, patch }, before);
}

/** Appends to the timeline server-side so two devices can't overwrite each other. */
export async function logLeadActivity(id: string, activity: Omit<LeadActivity, "id" | "at">, patch: Partial<Lead> = {}) {
  if (!remote()) {
    platformStore.logLeadActivity(id, activity, patch);
    return true;
  }
  const row: LeadActivity = { id: crypto.randomUUID(), at: new Date().toISOString(), ...activity };
  const before = snapshot.leads;
  set({
    leads: before.map((l) => (l.id === id ? { ...l, ...patch, activities: [row, ...(l.activities ?? [])] } : l)),
    error: null,
  });
  return write({ kind: "activity", id, activity: row, patch }, before);
}
