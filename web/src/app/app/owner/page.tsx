"use client";

import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, RefreshCw, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePaymentsBook, usePoliciesBook, useProducts } from "@/lib/data";
import { ownerSummary, type DayTotal } from "@/lib/engines/owner";
import { compactMoney, money, pct } from "@/lib/format";
import { useLeads } from "@/lib/leads";
import { agents as demoAgents } from "@/lib/seed";
import { canManageAgents, listTeam } from "@/lib/team";
import type { Agent } from "@/lib/types";
import { Card, PageHeader, Table } from "@/components/ui";

type AgentRef = Pick<Agent, "id" | "dbId" | "name" | "branch">;

/** Real agents for a real admin; the demo roster otherwise. */
function useAgentRoster(): AgentRef[] {
  const { user, operatorId } = useAuth();
  const live = canManageAgents(user) && Boolean(operatorId);
  const [team, setTeam] = useState<AgentRef[] | null>(null);
  useEffect(() => {
    if (!live || !operatorId) return;
    let cancelled = false;
    listTeam(operatorId)
      .then((rows) => !cancelled && setTeam(rows.map((r) => ({ id: r.id, dbId: r.id, name: r.name, branch: r.branch }))))
      .catch(() => !cancelled && setTeam([]));
    return () => {
      cancelled = true;
    };
  }, [live, operatorId]);
  return live ? (team ?? []) : demoAgents;
}

export default function OwnerPage() {
  const { policies } = usePoliciesBook();
  const { payments } = usePaymentsBook();
  const { leads } = useLeads();
  const { products } = useProducts();
  const roster = useAgentRoster();
  const [now] = useState(() => new Date());

  const s = useMemo(() => {
    const lines = new Map(products.map((p) => [p.id, p.line]));
    return ownerSummary({ policies, payments, leads, agents: roster, lineOf: (id) => lines.get(id), now });
  }, [policies, payments, leads, products, roster, now]);

  const overdueTotal = s.agents.reduce((n, a) => n + a.overdue, 0);
  const up = (s.monthChange ?? 0) >= 0;

  return (
    <div>
      <PageHeader
        eyebrow="Business overview"
        title="How Bimafy is doing"
        description="Money in, cover sold, who is selling, and what needs you today — from live data."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <p className="text-sm text-mute">Collected this month</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight text-heading">{money(s.collectedMonth)}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {s.monthChange === null ? (
              <span className="text-mute">Nothing collected by this day last month to compare with</span>
            ) : (
              <span className={up ? "inline-flex items-center gap-1 text-teal-ink" : "inline-flex items-center gap-1 text-danger"}>
                {up ? <ArrowUpRight className="h-4 w-4" aria-hidden /> : <ArrowDownRight className="h-4 w-4" aria-hidden />}
                {up ? "+" : ""}
                {pct(s.monthChange, 0)} vs the same days last month
              </span>
            )}
            <span className="text-mute">· Today {money(s.collectedToday)}</span>
          </p>
          <DailyBars days={s.daily} />
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Tile label="Policies sold this month" value={String(s.policiesSoldMonth)} hint={`${s.activePolicies} active in total`} />
          <Tile label="New leads this month" value={String(s.newLeadsMonth)} hint={`Pipeline ${compactMoney(s.openPipeline)}`} />
          <Tile
            label="Lead conversion"
            value={s.conversion === null ? "—" : pct(s.conversion, 0)}
            hint="Won out of all closed leads"
          />
          <Tile label="Agent commission earned" value={compactMoney(s.commissionOwed)} hint="On money collected, after clawbacks" />
        </div>
      </div>

      <h2 className="mt-8 font-display text-2xl text-heading">Needs you today</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <ActionCard
          href="/app/payments"
          icon={<Wallet className="h-5 w-5" aria-hidden />}
          title={`${s.failedPayments.length} failed M-Pesa payment${s.failedPayments.length === 1 ? "" : "s"}`}
          detail={s.failedPayments.length ? `${money(s.failedAmount)} to chase in the last 30 days` : "Nothing to chase"}
          urgent={s.failedPayments.length > 0}
        />
        <ActionCard
          href="/app/agent"
          icon={<RefreshCw className="h-5 w-5" aria-hidden />}
          title={`${s.renewalsAtRisk.length} renewal${s.renewalsAtRisk.length === 1 ? "" : "s"} at high risk`}
          detail={
            s.renewalsAtRisk[0]
              ? `Next: ${s.renewalsAtRisk[0].policy.participantName} · ${s.renewalsAtRisk[0].policy.number}`
              : "No high-risk renewals in the next 60 days"
          }
          urgent={s.renewalsAtRisk.length > 0}
        />
        <ActionCard
          href="/app/team"
          icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
          title={`${overdueTotal} overdue follow-up${overdueTotal === 1 ? "" : "s"}`}
          detail={
            overdueTotal
              ? `Most behind: ${[...s.agents].sort((a, b) => b.overdue - a.overdue)[0]?.name ?? "—"}`
              : "Every agent is up to date"
          }
          urgent={overdueTotal > 0}
        />
      </div>

      <Card className="mt-8 p-2">
        <div className="px-3 pt-3">
          <h2 className="font-display text-xl text-heading">Agents</h2>
          <p className="text-sm text-mute">Ranked by money collected on the policies they sold.</p>
        </div>
        {s.agents.length === 0 ? (
          <p className="px-3 py-6 text-sm text-mute">
            No agents yet. <Link className="text-teal-ink underline" href="/app/team">Add your first agent</Link>.
          </p>
        ) : (
          <Table headers={["Agent", "Open leads", "Won this month", "Conversion", "Overdue", "Policies", "Collected", "Commission"]}>
            {s.agents.map((a) => (
              <tr key={a.key} className="border-b border-line/70">
                <td className="px-3 py-3">
                  <p className="font-medium text-heading">{a.name}</p>
                  <p className="text-xs text-mute">{a.branch}</p>
                </td>
                <td className="px-3 py-3 tabular-nums">{a.openLeads}</td>
                <td className="px-3 py-3 tabular-nums">{a.wonThisMonth}</td>
                <td className="px-3 py-3 tabular-nums">{a.conversion === null ? "—" : pct(a.conversion, 0)}</td>
                <td className={a.overdue ? "px-3 py-3 font-medium tabular-nums text-danger" : "px-3 py-3 tabular-nums"}>{a.overdue}</td>
                <td className="px-3 py-3 tabular-nums">{a.policiesSold}</td>
                <td className="px-3 py-3 tabular-nums">{money(a.premiumCollected)}</td>
                <td className="px-3 py-3 tabular-nums">{money(a.commissionOwed)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-mute">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-heading">{value}</p>
      {hint ? <p className="mt-1 text-xs text-mute">{hint}</p> : null}
    </Card>
  );
}

function ActionCard({
  href,
  icon,
  title,
  detail,
  urgent,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
  urgent: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-teal"
    >
      <span className={urgent ? "mt-0.5 text-gold-ink" : "mt-0.5 text-teal-ink"}>{icon}</span>
      <span>
        <span className="block font-semibold text-heading">{title}</span>
        <span className="block text-sm text-mute">{detail}</span>
      </span>
    </Link>
  );
}

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "short", timeZone: "UTC" });

/** Daily collections, last 14 days: one series, so no legend — the heading names it. */
function DailyBars({ days }: { days: DayTotal[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.amount), 0);
  const top = niceCeil(max);
  const shown = active ?? days.length - 1;

  return (
    <figure className="mt-6">
      <figcaption className="flex flex-col gap-1 text-xs text-mute sm:flex-row sm:items-baseline sm:justify-between">
        <span>Collected per day (KES) · last {days.length} days</span>
        <span aria-live="polite" className="text-ink">
          {dayLabel(days[shown].day)}: <span className="font-semibold">{money(days[shown].amount)}</span>
          {days[shown].count ? ` · ${days[shown].count} payment${days[shown].count === 1 ? "" : "s"}` : ""}
        </span>
      </figcaption>
      {top === 0 ? (
        <p className="mt-3 grid h-40 place-items-center rounded-xl border border-dashed border-line text-sm text-mute">
          No payments collected in the last {days.length} days yet.
        </p>
      ) : (
      <div className="relative mt-3 h-40">
        {/* Recessive hairline grid: top value, middle, baseline. */}
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2 left-0 bg-surface pr-1 text-[10px] tabular-nums text-mute">
              {axisLabel(top * f)}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 left-8 flex items-end gap-0.5" onMouseLeave={() => setActive(null)}>
          {days.map((d, i) => (
            <button
              key={d.day}
              type="button"
              className="group flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${dayLabel(d.day)}: ${money(d.amount)}`}
            >
              <span
                className={
                  "w-full max-w-6 rounded-t-[4px] transition-colors " +
                  (i === shown ? "bg-teal" : "bg-teal/45 group-hover:bg-teal/70")
                }
                style={{ height: top ? `${Math.max((d.amount / top) * 100, d.amount ? 2 : 0)}%` : "0%" }}
              />
            </button>
          ))}
        </div>
      </div>
      )}
      <div className="ml-8 mt-1 flex justify-between text-[10px] text-mute">
        <span>{dayLabel(days[0].day)}</span>
        <span>Today</span>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-mute hover:text-ink">Show as a table</summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead>
            <tr className="text-mute">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 font-medium">Payments</th>
              <th className="py-1 text-right font-medium">Collected</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day} className="border-t border-line/60">
                <td className="py-1">{dayLabel(d.day)}</td>
                <td className="py-1 tabular-nums">{d.count}</td>
                <td className="py-1 text-right tabular-nums">{money(d.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** 0 / 500 / 2K / 1.5M — short tick labels, no currency (the caption says KES). */
function axisLabel(value: number) {
  if (value >= 1_000_000) return `${+(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${+(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

/** Round an axis maximum up to a clean number (1, 2 or 5 × 10ⁿ). */
function niceCeil(value: number) {
  if (value <= 0) return 0;
  const exp = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * exp >= value) ?? 10;
  return step * exp;
}
