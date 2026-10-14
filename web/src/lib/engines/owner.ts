import type { Agent, Lead, Payment, Policy, ProductLine } from "../types";
import { commissionStatement, followUpAgenda, renewalQueue, type RenewalItem } from "./agency.ts";

/**
 * The owner's one-screen view of the business: money in, cover sold, who is
 * selling, what is about to be lost and what to chase. Pure, so it unit-tests.
 */

const DAY = 86_400_000;
const PAID = new Set(["completed", "reconciled"]);

/** Nairobi calendar day (EAT, UTC+3) for an ISO timestamp — "today" means Kenyan today. */
export function eatDay(iso: string | Date) {
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  return new Date(t + 3 * 3_600_000).toISOString().slice(0, 10);
}

const monthOf = (day: string) => day.slice(0, 7);

function prevMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export type DayTotal = { day: string; amount: number; count: number };

export type AgentRow = {
  key: string;
  name: string;
  branch: string;
  openLeads: number;
  wonThisMonth: number;
  conversion: number | null;
  overdue: number;
  policiesSold: number;
  premiumCollected: number;
  commissionOwed: number;
};

export type OwnerSummary = {
  today: string;
  collectedToday: number;
  collectedMonth: number;
  collectedPrevMonth: number;
  /** Change vs the same number of days into last month (null when last month had nothing). */
  monthChange: number | null;
  daily: DayTotal[];
  policiesSoldMonth: number;
  activePolicies: number;
  newLeadsMonth: number;
  openPipeline: number;
  conversion: number | null;
  agents: AgentRow[];
  renewalsAtRisk: RenewalItem[];
  failedPayments: Payment[];
  failedAmount: number;
  commissionOwed: number;
};

export function ownerSummary(input: {
  policies: Policy[];
  payments: Payment[];
  leads: Lead[];
  agents: Pick<Agent, "id" | "dbId" | "name" | "branch">[];
  lineOf?: (productId: string) => ProductLine | undefined;
  now?: Date;
  days?: number;
}): OwnerSummary {
  const now = input.now ?? new Date();
  const days = input.days ?? 14;
  const today = eatDay(now);
  const month = monthOf(today);
  const dayOfMonth = Number(today.slice(8, 10));
  const lineOf = input.lineOf ?? (() => undefined);

  const paid = input.payments.filter((p) => PAID.has(p.status) && p.paidAt);
  const paidDay = (p: Payment) => eatDay(p.paidAt!);

  const collectedToday = sum(paid.filter((p) => paidDay(p) === today));
  const collectedMonth = sum(paid.filter((p) => monthOf(paidDay(p)) === month));
  const last = prevMonth(month);
  const collectedPrevMonth = sum(paid.filter((p) => monthOf(paidDay(p)) === last));
  // Like-for-like: the first N days of last month vs the first N days of this one.
  const prevToDate = sum(
    paid.filter((p) => monthOf(paidDay(p)) === last && Number(paidDay(p).slice(8, 10)) <= dayOfMonth),
  );
  const monthChange = prevToDate > 0 ? (collectedMonth - prevToDate) / prevToDate : null;

  const daily: DayTotal[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = eatDay(new Date(now.getTime() - i * DAY));
    const onDay = paid.filter((p) => paidDay(p) === day);
    daily.push({ day, amount: sum(onDay), count: onDay.length });
  }

  const policiesSoldMonth = input.policies.filter((p) => monthOf(eatDay(p.createdAt)) === month).length;
  const activePolicies = input.policies.filter((p) => p.status === "active" || p.status === "reinstated").length;

  const newLeadsMonth = input.leads.filter((l) => l.createdAt && monthOf(eatDay(l.createdAt)) === month).length;
  const open = input.leads.filter((l) => l.status !== "won" && l.status !== "lost");
  const openPipeline = open.reduce((s, l) => s + (l.value ?? 0), 0);
  const closed = input.leads.filter((l) => l.status === "won" || l.status === "lost");
  const conversion = closed.length ? closed.filter((l) => l.status === "won").length / closed.length : null;

  // Leads and policies point at an agent by demo id or database id; accept both.
  const keyOf = (a: { id: string; dbId?: string }) => a.dbId ?? a.id;
  const belongs = (a: { id: string; dbId?: string }, id?: string) => Boolean(id) && (id === a.id || id === a.dbId);

  const agents: AgentRow[] = input.agents.map((a) => {
    const leads = input.leads.filter((l) => belongs(a, l.agentId));
    const mineOpen = leads.filter((l) => l.status !== "won" && l.status !== "lost");
    const mineClosed = leads.filter((l) => l.status === "won" || l.status === "lost");
    const won = leads.filter((l) => l.status === "won");
    const wonThisMonth = won.filter((l) => monthOf(eatDay(lastTouch(l) ?? l.createdAt ?? now.toISOString())) === month).length;
    const policies = input.policies.filter((p) => belongs(a, p.agentId));
    const numbers = new Set(policies.map((p) => p.number));
    const theirPayments = input.payments.filter((p) => p.policyNumber && numbers.has(p.policyNumber));
    const statement = commissionStatement(policies, theirPayments, lineOf, now);
    return {
      key: keyOf(a),
      name: a.name,
      branch: a.branch,
      openLeads: mineOpen.length,
      wonThisMonth,
      conversion: mineClosed.length ? won.length / mineClosed.length : null,
      overdue: followUpAgenda(leads, now).overdue.length,
      policiesSold: policies.length,
      premiumCollected: statement.totals.collected,
      commissionOwed: statement.totals.net,
    };
  });
  agents.sort((x, y) => y.premiumCollected - x.premiumCollected || y.openLeads - x.openLeads);

  const renewalsAtRisk = renewalQueue(input.policies, input.payments, now, 60)
    .filter((r) => r.riskLabel === "high")
    .sort((x, y) => y.lapseRisk - x.lapseRisk || x.daysToExpiry - y.daysToExpiry);

  const since = now.getTime() - 30 * DAY;
  const failedPayments = input.payments
    .filter((p) => p.status === "failed" && (!p.paidAt || Date.parse(p.paidAt) >= since))
    .sort((x, y) => y.amount - x.amount);

  return {
    today,
    collectedToday,
    collectedMonth,
    collectedPrevMonth,
    monthChange,
    daily,
    policiesSoldMonth,
    activePolicies,
    newLeadsMonth,
    openPipeline,
    conversion,
    agents,
    renewalsAtRisk,
    failedPayments,
    failedAmount: sum(failedPayments),
    commissionOwed: agents.reduce((s, a) => s + a.commissionOwed, 0),
  };
}

function sum(payments: Payment[]) {
  return payments.reduce((s, p) => s + p.amount, 0);
}

function lastTouch(lead: Lead) {
  return lead.activities?.[0]?.at;
}
