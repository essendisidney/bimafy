"use client";

import { useSyncExternalStore } from "react";
import {
  seedAuditLogs,
  seedCessions,
  seedClaims,
  seedDocuments,
  seedJournals,
  seedLeads,
  seedNotifications,
  seedPayments,
  seedPolicies,
  seedQuotes,
  seedRecoveries,
  seedScreenings,
  seedSurplusPeriods,
  seedTickets,
  treaties as seedTreaties,
} from "./seed";
import type {
  AmlScreening,
  AuditLogEntry,
  Claim,
  DocumentItem,
  JournalEntry,
  KycStatus,
  Lead,
  LeadActivity,
  NotificationItem,
  Payment,
  PlatformState,
  Policy,
  Quote,
  ReinsuranceCession,
  ReinsuranceRecovery,
  SurplusPeriod,
  Ticket,
  Treaty,
  WebhookDelivery,
} from "./types";

const KEY = "bimafy.platform";

function seedState(): PlatformState {
  return {
    quotes: seedQuotes,
    policies: seedPolicies,
    claims: seedClaims,
    payments: seedPayments,
    leads: seedLeads,
    tickets: seedTickets,
    notifications: seedNotifications,
    surplusPeriods: seedSurplusPeriods,
    kycOverrides: {},
    screenings: seedScreenings,
    auditLogs: seedAuditLogs,
    documents: seedDocuments,
    treaties: seedTreaties,
    cessions: seedCessions,
    recoveries: seedRecoveries,
    journals: seedJournals,
    balanceDeltas: {},
    webhooks: [],
  };
}

let state: PlatformState = seedState();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(state));
}

function load() {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    emit();
    return;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PlatformState>;
    state = {
      ...seedState(),
      ...parsed,
      surplusPeriods: parsed.surplusPeriods?.length ? parsed.surplusPeriods : seedSurplusPeriods,
      screenings: parsed.screenings?.length ? parsed.screenings : seedScreenings,
      auditLogs: parsed.auditLogs?.length ? parsed.auditLogs : seedAuditLogs,
      kycOverrides: parsed.kycOverrides ?? {},
      documents: parsed.documents?.length ? parsed.documents : seedDocuments,
      treaties: parsed.treaties?.length ? parsed.treaties : seedTreaties,
      cessions: parsed.cessions?.length ? parsed.cessions : seedCessions,
      recoveries: parsed.recoveries?.length ? parsed.recoveries : seedRecoveries,
      journals: parsed.journals?.length ? parsed.journals : seedJournals,
      balanceDeltas: parsed.balanceDeltas ?? {},
      webhooks: parsed.webhooks ?? [],
    };
  } catch {
    state = seedState();
  }
  emit();
}

if (typeof window !== "undefined") load();

function pushAudit(entry: Omit<AuditLogEntry, "id" | "createdAt"> & { id?: string; createdAt?: string }) {
  const row: AuditLogEntry = {
    id: entry.id ?? `aud-${crypto.randomUUID().slice(0, 8)}`,
    action: entry.action,
    actor: entry.actor,
    subject: entry.subject,
    detail: entry.detail,
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };
  state = { ...state, auditLogs: [row, ...state.auditLogs].slice(0, 200) };
}

export const platformStore = {
  get() {
    return state;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  addQuote(quote: Quote) {
    state = { ...state, quotes: [quote, ...state.quotes] };
    emit();
  },
  updateQuote(id: string, patch: Partial<Quote>) {
    state = { ...state, quotes: state.quotes.map((q) => (q.id === id ? { ...q, ...patch } : q)) };
    emit();
  },
  addPolicy(policy: Policy) {
    state = { ...state, policies: [policy, ...state.policies] };
    emit();
  },
  updatePolicy(id: string, patch: Partial<Policy>) {
    state = { ...state, policies: state.policies.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
    emit();
  },
  addClaim(claim: Claim) {
    state = { ...state, claims: [claim, ...state.claims] };
    emit();
  },
  updateClaim(id: string, patch: Partial<Claim>) {
    state = { ...state, claims: state.claims.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
    emit();
  },
  addPayment(payment: Payment) {
    state = { ...state, payments: [payment, ...state.payments] };
    emit();
  },
  addNotification(notification: NotificationItem) {
    state = { ...state, notifications: [notification, ...state.notifications] };
    emit();
  },
  updateNotification(id: string, patch: Partial<NotificationItem>) {
    state = {
      ...state,
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    };
    emit();
  },
  addJournal(entry: JournalEntry) {
    state = { ...state, journals: [entry, ...state.journals] };
    emit();
  },
  addLead(lead: Lead) {
    state = { ...state, leads: [lead, ...state.leads] };
    emit();
  },
  updateLead(id: string, patch: Partial<Lead>) {
    state = { ...state, leads: state.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
    emit();
  },
  logLeadActivity(id: string, activity: Omit<LeadActivity, "id" | "at">, patch: Partial<Lead> = {}) {
    const row: LeadActivity = { id: `act-${crypto.randomUUID().slice(0, 8)}`, at: new Date().toISOString(), ...activity };
    state = {
      ...state,
      leads: state.leads.map((l) =>
        l.id === id ? { ...l, ...patch, activities: [row, ...(l.activities ?? [])] } : l,
      ),
    };
    emit();
  },
  addTicket(ticket: Ticket) {
    state = { ...state, tickets: [ticket, ...state.tickets] };
    emit();
  },
  updateTicket(id: string, patch: Partial<Ticket>) {
    state = {
      ...state,
      tickets: state.tickets.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
      ),
    };
    emit();
  },
  addSurplusPeriod(period: SurplusPeriod) {
    state = { ...state, surplusPeriods: [period, ...state.surplusPeriods] };
    emit();
  },
  updateSurplusPeriod(id: string, patch: Partial<SurplusPeriod>) {
    state = {
      ...state,
      surplusPeriods: state.surplusPeriods.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    };
    emit();
  },
  setKyc(participantId: string, kyc: KycStatus, actor: string, subjectName: string) {
    state = {
      ...state,
      kycOverrides: { ...state.kycOverrides, [participantId]: kyc },
    };
    pushAudit({
      action: `kyc.${kyc}`,
      actor,
      subject: subjectName,
      detail: `KYC status set to ${kyc}.`,
    });
    emit();
  },
  addScreening(screening: AmlScreening, actor: string) {
    state = { ...state, screenings: [screening, ...state.screenings] };
    pushAudit({
      action: "aml.screening",
      actor,
      subject: screening.participantName,
      detail: `${screening.type.replaceAll("_", " ")} → ${screening.result}`,
    });
    emit();
  },
  updateScreening(id: string, patch: Partial<AmlScreening>, actor: string) {
    const prev = state.screenings.find((s) => s.id === id);
    state = {
      ...state,
      screenings: state.screenings.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    };
    if (prev) {
      pushAudit({
        action: "aml.update",
        actor,
        subject: prev.participantName,
        detail: `Screening ${prev.type} updated${patch.result ? ` to ${patch.result}` : ""}.`,
      });
    }
    emit();
  },
  addDocument(doc: DocumentItem) {
    state = { ...state, documents: [doc, ...state.documents] };
    emit();
  },
  updateDocument(id: string, patch: Partial<DocumentItem>) {
    state = {
      ...state,
      documents: state.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    };
    emit();
  },
  updateTreaty(id: string, patch: Partial<Treaty>) {
    state = {
      ...state,
      treaties: state.treaties.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    };
    emit();
  },
  addCession(cession: ReinsuranceCession) {
    state = {
      ...state,
      cessions: [cession, ...state.cessions],
      treaties: state.treaties.map((t) =>
        t.id === cession.treatyId
          ? { ...t, cededYtd: Math.round((t.cededYtd + cession.cededContribution) * 100) / 100 }
          : t,
      ),
    };
    emit();
  },
  addRecovery(recovery: ReinsuranceRecovery) {
    state = {
      ...state,
      recoveries: [recovery, ...state.recoveries],
      treaties: state.treaties.map((t) =>
        t.id === recovery.treatyId
          ? { ...t, recoveriesYtd: Math.round((t.recoveriesYtd + recovery.amount) * 100) / 100 }
          : t,
      ),
    };
    emit();
  },
  updateRecovery(id: string, patch: Partial<ReinsuranceRecovery>) {
    state = {
      ...state,
      recoveries: state.recoveries.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    };
    emit();
  },
  addAuditLog(entry: Omit<AuditLogEntry, "id" | "createdAt">) {
    pushAudit(entry);
  },
  addWebhook(row: WebhookDelivery) {
    state = { ...state, webhooks: [row, ...state.webhooks].slice(0, 80) };
    emit();
  },
  updateWebhook(id: string, patch: Partial<WebhookDelivery>) {
    state = {
      ...state,
      webhooks: state.webhooks.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    };
    emit();
  },
  creditDistributor(id: string, walletDelta: number, gwpDelta = 0) {
    const prev = state.balanceDeltas[id] ?? { wallet: 0, gwp: 0 };
    state = {
      ...state,
      balanceDeltas: {
        ...state.balanceDeltas,
        [id]: {
          wallet: Math.round((prev.wallet + walletDelta) * 100) / 100,
          gwp: Math.round((prev.gwp + gwpDelta) * 100) / 100,
        },
      },
    };
    emit();
  },
  reset() {
    state = seedState();
    emit();
  },
};

export function usePlatform() {
  return useSyncExternalStore(platformStore.subscribe, platformStore.get, platformStore.get);
}
