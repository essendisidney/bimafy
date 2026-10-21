import type { InstalmentPlan, Payment, Policy } from "../types";
import { eatDay } from "./owner.ts";

/**
 * "Lipa pole pole" instalment plans and the reminder schedule that keeps
 * clients paying and renewing. Pure (dates are Nairobi calendar days as
 * YYYY-MM-DD), so it unit-tests and runs the same on the server or a phone.
 */

const DAY = 86_400_000;
const PAID = new Set(["completed", "reconciled"]);

/** Days an instalment can be late before cover is at risk of suspension. */
export const GRACE_DAYS = 14;
/** A reminder not sent within this many days of its date is skipped for the next one. */
export const STALE_DAYS = 3;
export const MAX_INSTALMENTS = 12;

const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);
export const addDay = (day: string, n: number) => new Date(ms(day) + n * DAY).toISOString().slice(0, 10);
/** Whole days from `b` to `a` (positive when `a` is later). */
export const daysBetween = (a: string, b: string) => Math.round((ms(a) - ms(b)) / DAY);

/** Same day-of-month `n` months on, clamped to the month's last day (31 Jan + 1 → 28/29 Feb). */
export function addMonths(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ plans

export type Instalment = { n: number; label: "deposit" | "instalment"; due: string; amount: number };

export function validatePlan(plan: Pick<InstalmentPlan, "total" | "deposit" | "count" | "firstDue">): string | null {
  if (!(plan.total > 0)) return "The premium must be more than zero.";
  if (!Number.isInteger(plan.count) || plan.count < 1 || plan.count > MAX_INSTALMENTS)
    return `Choose between 1 and ${MAX_INSTALMENTS} instalments.`;
  if (plan.deposit < 0 || plan.deposit >= plan.total) return "The deposit must be less than the premium.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.firstDue)) return "Pick the first due date.";
  if (Math.floor((plan.total - plan.deposit) / plan.count) < 1) return "Each instalment must be at least KES 1.";
  return null;
}

/** Deposit (if any) then `count` equal whole-shilling instalments; the last one absorbs the rounding. */
export function instalmentSchedule(plan: InstalmentPlan): Instalment[] {
  const rows: Instalment[] = [];
  const total = Math.round(plan.total);
  const deposit = Math.round(plan.deposit);
  if (deposit > 0) rows.push({ n: 0, label: "deposit", due: eatDay(plan.createdAt), amount: deposit });
  const rest = total - deposit;
  const each = Math.floor(rest / plan.count);
  for (let i = 0; i < plan.count; i++) {
    const due = plan.every === "weekly" ? addDay(plan.firstDue, 7 * i) : addMonths(plan.firstDue, i);
    const amount = i === plan.count - 1 ? rest - each * (plan.count - 1) : each;
    rows.push({ n: i + 1, label: "instalment", due, amount });
  }
  return rows;
}

export type InstalmentState = "paid" | "part" | "overdue" | "due" | "upcoming";
export type InstalmentRow = Instalment & { paid: number; state: InstalmentState };
export type PlanHealth = "complete" | "on_track" | "behind" | "at_risk";

export type PlanStatus = {
  rows: InstalmentRow[];
  total: number;
  paid: number;
  balance: number;
  /** First instalment not yet fully paid. */
  next?: InstalmentRow;
  /** Unpaid amount on instalments whose due date has passed. */
  overdueAmount: number;
  /** Days the oldest unpaid instalment is past due (0 when none). */
  daysLate: number;
  health: PlanHealth;
};

/** Settled payments for this policy since the plan was set up (older ones paid earlier cover). */
export function planPayments(policy: Pick<Policy, "number" | "instalmentPlan">, payments: Payment[]) {
  const plan = policy.instalmentPlan;
  if (!plan) return [];
  const since = eatDay(plan.createdAt);
  return payments.filter(
    (p) => p.policyNumber === policy.number && PAID.has(p.status) && p.paidAt && eatDay(p.paidAt) >= since,
  );
}

/** Money is applied oldest instalment first, the way a client thinks of "what I've paid so far". */
export function planStatus(plan: InstalmentPlan, paidTotal: number, today: string): PlanStatus {
  let left = Math.max(0, paidTotal);
  const rows: InstalmentRow[] = instalmentSchedule(plan).map((r) => {
    const paid = Math.min(r.amount, left);
    left -= paid;
    const state: InstalmentState =
      paid >= r.amount ? "paid" : r.due < today ? "overdue" : r.due === today ? "due" : paid > 0 ? "part" : "upcoming";
    return { ...r, paid, state };
  });
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  const next = rows.find((r) => r.paid < r.amount);
  const overdueAmount = rows.filter((r) => r.due < today).reduce((s, r) => s + r.amount - r.paid, 0);
  const daysLate = next && next.due < today ? daysBetween(today, next.due) : 0;
  const health: PlanHealth = !next ? "complete" : daysLate >= GRACE_DAYS ? "at_risk" : daysLate > 0 ? "behind" : "on_track";
  return { rows, total, paid, balance: total - paid, next, overdueAmount, daysLate, health };
}

// ------------------------------------------------------------------ reminders

export type ReminderKind =
  | "renewal_30"
  | "renewal_7"
  | "renewal_1"
  | "renewal_lapsed"
  | "instalment_soon"
  | "instalment_today"
  | "instalment_late"
  | "instalment_final";

export type Reminder = {
  /** Stable id: the same reminder is never sent twice. */
  key: string;
  kind: ReminderKind;
  track: "renewal" | "instalment";
  policy: Policy;
  /** Day the reminder should go out. */
  sendOn: string;
  /** Expiry date (renewals) or instalment due date. */
  anchor: string;
  /** Amount to ask for: the renewal premium or what is owed on the instalment. */
  amount: number;
  instalment?: { n: number; of: number };
};

const RENEWAL_TOUCHES: { kind: ReminderKind; offset: number }[] = [
  { kind: "renewal_30", offset: -30 },
  { kind: "renewal_7", offset: -7 },
  { kind: "renewal_1", offset: -1 },
  { kind: "renewal_lapsed", offset: 3 },
];
const INSTALMENT_TOUCHES: { kind: ReminderKind; offset: number }[] = [
  { kind: "instalment_soon", offset: -3 },
  { kind: "instalment_today", offset: 0 },
  { kind: "instalment_late", offset: 3 },
  { kind: "instalment_final", offset: 10 },
];

/** Policies that should never get renewal or payment nudges. */
const QUIET = new Set(["cancelled", "draft", "pending_payment", "pending_underwriting"]);

function touchesFor(policy: Policy, payments: Payment[], today: string): Reminder[] {
  if (QUIET.has(policy.status)) return [];
  const out: Reminder[] = [];

  if (policy.frequency !== "single") {
    const expiry = policy.expiry.slice(0, 10);
    for (const t of RENEWAL_TOUCHES) {
      out.push({
        key: `${policy.number}:${t.kind}:${expiry}`,
        kind: t.kind,
        track: "renewal",
        policy,
        sendOn: addDay(expiry, t.offset),
        anchor: expiry,
        amount: policy.contribution,
      });
    }
  }

  const plan = policy.instalmentPlan;
  if (plan) {
    const paid = planPayments(policy, payments).reduce((s, p) => s + p.amount, 0);
    const status = planStatus(plan, paid, today);
    const next = status.next;
    if (next) {
      const of = status.rows.filter((r) => r.label === "instalment").length;
      for (const t of INSTALMENT_TOUCHES) {
        out.push({
          key: `${policy.number}:${t.kind}:${next.n}:${next.due}`,
          kind: t.kind,
          track: "instalment",
          policy,
          sendOn: addDay(next.due, t.offset),
          anchor: next.due,
          // Late clients are asked for everything overdue, not just this instalment.
          amount: next.due < today ? Math.max(status.overdueAmount, next.amount - next.paid) : next.amount - next.paid,
          instalment: { n: next.n, of },
        });
      }
    }
  }
  return out;
}

export type ReminderQueue = {
  /** Should go out today and haven't been sent. */
  due: Reminder[];
  /** Already sent (kept so the screen can show what was done). */
  sent: Reminder[];
  /** The next reminder per policy/track coming up within `horizonDays`. */
  upcoming: Reminder[];
};

/**
 * What to send today. Per policy and track only the latest reminder that has
 * come due counts, so a client who was missed on day -30 gets the day -7 one,
 * not both.
 */
export function reminderQueue(input: {
  policies: Policy[];
  payments: Payment[];
  today: string;
  sent?: ReadonlySet<string>;
  horizonDays?: number;
}): ReminderQueue {
  const { today } = input;
  const sentKeys = input.sent ?? new Set<string>();
  const horizon = input.horizonDays ?? 7;
  const due: Reminder[] = [];
  const sent: Reminder[] = [];
  const upcoming: Reminder[] = [];

  for (const policy of input.policies) {
    const touches = touchesFor(policy, input.payments, today);
    for (const track of ["renewal", "instalment"] as const) {
      const mine = touches.filter((t) => t.track === track).sort((a, b) => a.sendOn.localeCompare(b.sendOn));
      const current = mine.filter((t) => t.sendOn <= today).at(-1);
      if (current && daysBetween(today, current.sendOn) <= STALE_DAYS) {
        (sentKeys.has(current.key) ? sent : due).push(current);
      }
      const next = mine.find((t) => t.sendOn > today);
      if (next && daysBetween(next.sendOn, today) <= horizon) upcoming.push(next);
    }
  }

  // Money already late first, then whoever is closest to losing cover.
  const urgency = (r: Reminder) =>
    ({
      instalment_final: 0,
      renewal_lapsed: 1,
      instalment_late: 2,
      renewal_1: 3,
      instalment_today: 4,
      renewal_7: 5,
      instalment_soon: 6,
      renewal_30: 7,
    })[r.kind];
  due.sort((a, b) => urgency(a) - urgency(b) || b.amount - a.amount);
  upcoming.sort((a, b) => a.sendOn.localeCompare(b.sendOn));
  return { due, sent, upcoming };
}

export { eatDay };
