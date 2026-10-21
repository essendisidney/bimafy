"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eatDay,
  instalmentSchedule,
  planPayments,
  planStatus,
  validatePlan,
  type InstalmentState,
} from "@/lib/engines/reminders";
import { money } from "@/lib/format";
import type { InstalmentPlan as Plan, Payment, Policy } from "@/lib/types";
import { Button, Card, Field, cn, inputClass } from "@/components/ui";

const COUNTS = [2, 3, 4, 6, 10];

const STATE: Record<InstalmentState, [string, string]> = {
  paid: ["Paid", "text-teal-ink"],
  part: ["Part paid", "text-gold-ink"],
  due: ["Due today", "text-gold-ink"],
  overdue: ["Overdue", "text-danger"],
  upcoming: ["Upcoming", "text-mute"],
};

/** "Lipa pole pole": split a premium into a deposit and M-Pesa instalments, then track them. */
export function InstalmentPlanCard({
  policy,
  payments,
  onSave,
}: {
  policy: Policy;
  payments: Payment[];
  onSave: (plan: Plan | null) => Promise<void>;
}) {
  const [today] = useState(() => eatDay(new Date()));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = policy.instalmentPlan;

  const status = useMemo(
    () => (plan ? planStatus(plan, planPayments(policy, payments).reduce((s, p) => s + p.amount, 0), today) : null),
    [plan, policy, payments, today],
  );

  async function save(next: Plan | null) {
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the plan");
    } finally {
      setSaving(false);
    }
  }

  if (!plan || editing) {
    return (
      <PlanForm
        policy={policy}
        today={today}
        saving={saving}
        error={error}
        onCancel={plan ? () => setEditing(false) : undefined}
        onSave={save}
      />
    );
  }

  const s = status!;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-xl">Instalment plan</h2>
          <p className="text-sm text-mute">
            {money(s.paid)} of {money(s.total)} paid · {plan.count} {plan.every} instalments
          </p>
        </div>
        {s.health === "at_risk" ? (
          <span className="rounded-lg border border-danger/25 bg-danger/10 px-2 py-0.5 text-xs text-danger">
            {s.daysLate} days late — cover at risk
          </span>
        ) : s.health === "behind" ? (
          <span className="rounded-lg border border-gold/30 bg-gold/15 px-2 py-0.5 text-xs text-gold-ink">{s.daysLate} days late</span>
        ) : s.health === "complete" ? (
          <span className="rounded-lg border border-teal/20 bg-teal/10 px-2 py-0.5 text-xs text-teal-ink">Fully paid</span>
        ) : null}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand" aria-hidden>
        <div className="h-full rounded-full bg-teal" style={{ width: `${Math.round((s.paid / s.total) * 100)}%` }} />
      </div>
      <ol className="mt-4 divide-y divide-line text-sm">
        {s.rows.map((r) => (
          <li key={r.n} className="flex items-center justify-between gap-3 py-2">
            <span>
              <span className="font-medium">{r.n === 0 ? "Deposit" : `Instalment ${r.n}`}</span>
              <span className="text-mute"> · {r.due}</span>
            </span>
            <span className="text-right">
              <span className="font-medium">{money(r.amount)}</span>
              <span className={cn("ml-2 text-xs", STATE[r.state][1])}>{STATE[r.state][0]}</span>
            </span>
          </li>
        ))}
      </ol>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {s.next ? (
          <Button
            href={`/app/payments?policy=${encodeURIComponent(policy.id)}&amount=${Math.round(
              s.next.due < today ? Math.max(s.overdueAmount, s.next.amount - s.next.paid) : s.next.amount - s.next.paid,
            )}`}
          >
            Collect {money(s.next.due < today ? Math.max(s.overdueAmount, s.next.amount - s.next.paid) : s.next.amount - s.next.paid)} by M-Pesa
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Change plan
        </Button>
        <Button variant="ghost" onClick={() => save(null)} disabled={saving}>
          Remove plan
        </Button>
      </div>
    </Card>
  );
}

function PlanForm({
  policy,
  today,
  saving,
  error,
  onCancel,
  onSave,
}: {
  policy: Policy;
  today: string;
  saving: boolean;
  error: string | null;
  onCancel?: () => void;
  onSave: (plan: Plan) => void;
}) {
  const existing = policy.instalmentPlan;
  const [total, setTotal] = useState(existing?.total ?? policy.contribution);
  const [deposit, setDeposit] = useState(existing?.deposit ?? Math.round(policy.contribution * 0.2));
  const [count, setCount] = useState(existing?.count ?? 4);
  const [every, setEvery] = useState<Plan["every"]>(existing?.every ?? "monthly");
  const [firstDue, setFirstDue] = useState(existing?.firstDue ?? addMonths(today, 1));
  const [open, setOpen] = useState(Boolean(onCancel));

  const draft: Plan = {
    total: Number(total) || 0,
    deposit: Number(deposit) || 0,
    count,
    every,
    firstDue,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  const problem = validatePlan(draft);
  const rows = problem ? [] : instalmentSchedule(draft);
  const each = rows.find((r) => r.n === 1)?.amount ?? 0;

  if (!open) {
    return (
      <Card className="p-5">
        <h2 className="font-display text-xl">Pay in instalments</h2>
        <p className="mt-1 text-sm text-mute">
          Split {money(policy.contribution)} into a deposit and monthly or weekly M-Pesa payments. Bimafy reminds the client before
          each one is due.
        </p>
        <Button className="mt-4" variant="secondary" onClick={() => setOpen(true)}>
          Set up lipa pole pole
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="font-display text-xl">{existing ? "Change instalment plan" : "Pay in instalments"}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Premium to spread (KES)">
          <input className={inputClass} type="number" inputMode="numeric" min={1} value={total} onChange={(e) => setTotal(Number(e.target.value))} />
        </Field>
        <Field label="Deposit today (KES)">
          <input className={inputClass} type="number" inputMode="numeric" min={0} value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} />
        </Field>
        <Field label="Number of instalments">
          <select className={inputClass} value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Paid every">
          <select className={inputClass} value={every} onChange={(e) => setEvery(e.target.value as Plan["every"])}>
            <option value="monthly">Month</option>
            <option value="weekly">Week</option>
          </select>
        </Field>
        <Field label="First instalment due">
          <input className={inputClass} type="date" min={today} value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
        </Field>
      </div>
      {problem ? (
        <p className="mt-3 text-sm text-danger">{problem}</p>
      ) : (
        <p className="mt-3 rounded-xl bg-sand px-3 py-2 text-sm">
          {draft.deposit > 0 ? `${money(draft.deposit)} today, then ` : ""}
          {count} × about {money(each)} every {every === "monthly" ? "month" : "week"}, last one on {rows.at(-1)?.due}.
        </p>
      )}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => onSave(draft)} disabled={Boolean(problem) || saving}>
          {saving ? "Saving…" : "Save plan"}
        </Button>
        <Button variant="ghost" onClick={onCancel ?? (() => setOpen(false))}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
