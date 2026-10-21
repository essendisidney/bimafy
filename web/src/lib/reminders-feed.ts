import type { InstalmentPlan, Payment, Policy } from "./types";

/**
 * Shape of public.reminders_feed() (supabase/migrations/00014_reminder_log.sql)
 * and its mapping onto the app's Policy / Payment types, so the morning job
 * runs the exact same reminder engine as the Reminders screen.
 */

export type FeedPolicy = {
  id: string;
  operator_id: string;
  number: string;
  status: Policy["status"];
  frequency: Policy["frequency"];
  contribution: number | string;
  inception: string;
  expiry: string;
  created_at: string;
  instalment_plan: InstalmentPlan | null;
  participant_id: string;
  participant_name: string;
  phone: string | null;
  product_name: string;
  agent_id: string | null;
  agent_name: string | null;
};

export type FeedPayment = { policy_number: string; amount: number | string; status: Payment["status"]; paid_at: string | null };

export type ReminderFeed = { policies: FeedPolicy[]; payments: FeedPayment[]; sent: string[] };

export function feedPolicies(feed: ReminderFeed) {
  const phones = new Map<string, string>();
  const agentNames = new Map<string, string>();
  const policies: Policy[] = feed.policies.map((p) => {
    if (p.phone) phones.set(p.id, p.phone);
    if (p.agent_name) agentNames.set(p.id, p.agent_name);
    return {
      id: p.id,
      number: p.number,
      participantId: p.participant_id,
      participantName: p.participant_name,
      productId: "",
      productName: p.product_name,
      agentId: p.agent_id ?? undefined,
      agentName: p.agent_name ?? undefined,
      branch: "",
      status: p.status,
      channel: "agent",
      inception: p.inception,
      expiry: p.expiry,
      sumCovered: 0,
      contribution: Number(p.contribution),
      frequency: p.frequency,
      wakala: 0,
      tabarru: 0,
      createdAt: p.created_at,
      instalmentPlan: p.instalment_plan ?? undefined,
    };
  });
  const payments: Payment[] = feed.payments.map((p, i) => ({
    id: `feed-${i}`,
    reference: `feed-${i}`,
    policyNumber: p.policy_number,
    participantName: "",
    method: "mpesa_stk",
    status: p.status,
    amount: Number(p.amount),
    paidAt: p.paid_at ?? undefined,
  }));
  return { policies, payments, phones, agentNames, sent: new Set(feed.sent) };
}
