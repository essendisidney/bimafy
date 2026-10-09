"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { defaultOperatorId, isUuid } from "@/lib/ids";
import { platformStore, usePlatform } from "@/lib/store";
import type { Agent, Broker, Lead, LeadActivity, LeadSource, LeadStatus, ProductLine } from "@/lib/types";

/**
 * Lead book. Demo mode keeps leads in the local platform store. When Supabase
 * is configured AND the user has a real Supabase session, leads live in the
 * `leads` table (RLS scopes agents/brokers to their own rows) and this module
 * holds an optimistic in-memory copy. Local personas (no session) stay on demo
 * data, since RLS would hide every row from them.
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

type Snapshot = { leads: Lead[]; loading: boolean; error: string | null };
let snapshot: Snapshot = { leads: [], loading: false, error: null };
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

export async function refreshLeads() {
  if (!remote()) return;
  loadedFor = remoteUser;
  set({ loading: true });
  const { data, error } = await sb().from("leads").select("*").order("created_at", { ascending: false });
  if (error) set({ loading: false, error: error.message });
  else set({ loading: false, error: null, leads: (data ?? []).map((r: DbLead) => mapLead(r)) });
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
      set({ leads: [], error: null });
      void refreshLeads();
    }
  }, [userId]);

  if (mode === "demo") return { leads: demo.leads, loading: false, error: null, mode };
  return { ...live, mode };
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

export async function createLead(lead: Lead, operatorId?: string | null) {
  if (!remote()) {
    platformStore.addLead(lead);
    return true;
  }
  const before = snapshot.leads;
  set({ leads: [lead, ...before], error: null });
  const { error } = await sb().from("leads").insert(leadRow(lead, operatorId ?? defaultOperatorId()));
  return error ? fail(`Lead not saved: ${error.message}`, before) : true;
}

export async function createLeads(rows: Lead[], operatorId?: string | null) {
  if (!remote()) {
    rows.forEach((l) => platformStore.addLead(l));
    return true;
  }
  const before = snapshot.leads;
  set({ leads: [...rows, ...before], error: null });
  const op = operatorId ?? defaultOperatorId();
  const { error } = await sb().from("leads").insert(rows.map((l) => leadRow(l, op)));
  return error ? fail(`Import not saved: ${error.message}`, before) : true;
}

export async function updateLead(id: string, patch: Partial<Lead>) {
  if (!remote()) {
    platformStore.updateLead(id, patch);
    return true;
  }
  const before = snapshot.leads;
  set({ leads: before.map((l) => (l.id === id ? { ...l, ...patch } : l)), error: null });
  // RLS hides rows it denies, so a blocked update is "0 rows", not an error.
  const { data, error } = await sb().from("leads").update(patchRow(patch)).eq("id", id).select("id");
  if (error) return fail(`Lead not updated: ${error.message}`, before);
  return data?.length ? true : fail("Lead not updated: you no longer have access to it.", before);
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
  const { data, error } = await sb().rpc("log_lead_activity", { p_lead_id: id, p_activity: row, p_patch: patchRow(patch) });
  if (error) return fail(`Activity not saved: ${error.message}`, before);
  return data?.length ? true : fail("Activity not saved: you no longer have access to this lead.", before);
}
