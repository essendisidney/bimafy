"use client";

import { useState } from "react";
import Link from "next/link";
import { agents, participants, products } from "@/lib/seed";
import { useAuth } from "@/lib/auth";
import {
  OPEN_STAGES,
  STAGE_PROBABILITY,
  addDays,
  commissionStatement,
  crossSell,
  daysUntil,
  followUpAgenda,
  leaderboard,
  leadValue,
  nextBestAction,
  persistency,
  pipelineSummary,
  renewalQueue,
  scoreLead,
  targetForecast,
  whatsappLink,
  type LeadTemperature,
  type RenewalItem,
} from "@/lib/engines/agency";
import { pushNotification, withdrawCommission } from "@/lib/events/ledger";
import { compactMoney, formatDate, money, pct } from "@/lib/format";
import { platformStore, usePlatform } from "@/lib/store";
import type { Lead, LeadActivity, LeadSource, LeadStatus, ProductLine } from "@/lib/types";
import { Badge, Button, Card, Empty, Field, PageHeader, Stat, Table, cn, inputClass } from "@/components/ui";

const LINES: ProductLine[] = ["motor", "medical", "micro", "family_takaful", "funeral", "travel", "gadget", "agriculture", "livestock", "asset"];
const SOURCES: LeadSource[] = ["referral", "walk_in", "whatsapp", "partner", "ussd", "campaign", "renewal"];
const TABS = ["Today", "Pipeline", "Renewals", "Book & cross-sell", "Commissions", "Team"] as const;
type Tab = (typeof TABS)[number];

const lineOf = (productId: string) => products.find((p) => p.id === productId)?.line;
const label = (s: string) => s.replaceAll("_", " ");

const TEMP_STYLE: Record<LeadTemperature, string> = {
  hot: "bg-rose-50 text-rose-700 border-rose-200",
  warm: "bg-gold/15 text-[#8a6d12] border-gold/30",
  cold: "bg-sand text-mute border-line",
};

function ScorePill({ lead, now }: { lead: Lead; now: Date }) {
  const s = scoreLead(lead, now);
  return (
    <span
      title={s.reasons.join(" · ")}
      className={cn("inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs capitalize", TEMP_STYLE[s.temperature])}
    >
      {s.temperature} · {s.score}
    </span>
  );
}

export default function AgentPage() {
  const { user } = useAuth();
  const { leads, quotes, policies, payments, balanceDeltas } = usePlatform();
  const canSwitch = user?.role === "admin" || user?.role === "branch_manager";
  const [viewAgentId, setViewAgentId] = useState<string | null>(null);
  const agent = agents.find((a) => a.id === (viewAgentId ?? user?.agentId)) ?? agents[0];
  const [tab, setTab] = useState<Tab>("Today");
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  const delta = balanceDeltas[agent.id] ?? { wallet: 0, gwp: 0 };
  const liveWallet = agent.wallet + delta.wallet;
  const liveGwp = agent.ytdGwp + delta.gwp;
  const forecast = targetForecast(liveGwp, agent.target, now);

  const mine = leads.filter((l) => l.agentId === agent.id);
  const book = policies.filter((p) => p.agentId === agent.id);
  const agenda = followUpAgenda(mine, now);
  const pipeline = pipelineSummary(mine);
  const renewals = renewalQueue(book, payments, now);
  const statement = commissionStatement(book, payments, lineOf, now);
  const xsell = crossSell(book, participants, lineOf, now);
  const board = leaderboard(agents, balanceDeltas);
  const openLead = mine.find((l) => l.id === openLeadId) ?? null;
  const dueCount = agenda.overdue.length + agenda.today.length;
  const atRisk = renewals.filter((r) => r.riskLabel === "high").length;

  return (
    <div>
      <PageHeader
        eyebrow="InsuraX Agent"
        title={`${agent.name.split(" ")[0]}'s desk`}
        description={`${agent.code} · ${agent.branch} · ${agent.license}. Your day, your pipeline, your renewals and your money — in one place.`}
        actions={
          <>
            {canSwitch ? (
              <select
                className={cn(inputClass, "!w-auto")}
                value={agent.id}
                onChange={(e) => setViewAgentId(e.target.value)}
                aria-label="View agent"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Button href="/app/quotes/new">New quotation</Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Due today" value={String(dueCount)} hint={`${agenda.overdue.length} overdue follow-ups`} />
        <Stat label="Weighted pipeline" value={compactMoney(pipeline.weighted)} hint={`${mine.filter((l) => OPEN_STAGES.includes(l.status)).length} open leads · win ${pct(pipeline.winRate, 0)}`} />
        <Stat label="Renewals ≤90d" value={String(renewals.length)} hint={`${atRisk} high lapse risk`} />
        <Stat label="YTD GWP" value={compactMoney(liveGwp)} hint={`${pct(forecast.progress, 0)} of ${compactMoney(agent.target)}`} />
        <Stat label="Wallet" value={money(liveWallet)} hint={`Net earned on book ${money(statement.totals.net)}`} />
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition",
              tab === t ? "border-teal font-medium text-teal" : "border-transparent text-mute hover:text-ink",
            )}
          >
            {t}
            {t === "Today" && dueCount ? <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[10px] text-white">{dueCount}</span> : null}
            {t === "Renewals" && atRisk ? <span className="ml-1.5 rounded-full bg-gold px-1.5 text-[10px] text-ink">{atRisk}</span> : null}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "Today" ? (
          <TodayTab
            agentId={agent.id}
            agenda={agenda}
            renewals={renewals}
            forecast={forecast}
            now={now}
            onOpen={setOpenLeadId}
          />
        ) : null}
        {tab === "Pipeline" ? <PipelineTab leads={mine} now={now} onOpen={setOpenLeadId} /> : null}
        {tab === "Renewals" ? <RenewalsTab items={renewals} agentId={agent.id} persistency={persistency(book)} /> : null}
        {tab === "Book & cross-sell" ? <BookTab book={book} rows={xsell} agentId={agent.id} quotes={quotes.filter((q) => q.agentId === agent.id).length} /> : null}
        {tab === "Commissions" ? (
          <CommissionsTab statement={statement} wallet={liveWallet} onWithdraw={(amount) => withdrawCommission({ distributorId: agent.id, name: agent.name, amount, kind: "agent" })} />
        ) : null}
        {tab === "Team" ? <TeamTab rows={board} currentId={agent.id} /> : null}
      </div>

      {openLead ? <LeadDrawer lead={openLead} agentName={agent.name} now={now} onClose={() => setOpenLeadId(null)} /> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Today */

function TodayTab({
  agentId,
  agenda,
  renewals,
  forecast,
  now,
  onOpen,
}: {
  agentId: string;
  agenda: ReturnType<typeof followUpAgenda>;
  renewals: RenewalItem[];
  forecast: ReturnType<typeof targetForecast>;
  now: Date;
  onOpen: (id: string) => void;
}) {
  const urgentRenewals = renewals.filter((r) => r.daysToExpiry <= 30).slice(0, 4);
  const groups: { title: string; tone: string; rows: Lead[] }[] = [
    { title: "Overdue", tone: "text-danger", rows: agenda.overdue },
    { title: "Today", tone: "text-teal", rows: agenda.today },
    { title: "Needs a follow-up date", tone: "text-mute", rows: agenda.unscheduled },
    { title: "Next 7 days", tone: "text-mute", rows: agenda.upcoming },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Card className="p-5">
        <h2 className="font-display text-xl">Follow-ups</h2>
        <p className="text-xs text-mute">Ranked by propensity-to-bind. Tap a lead to log a call, WhatsApp or move the stage.</p>
        <div className="mt-4 space-y-5">
          {groups.map((g) =>
            g.rows.length ? (
              <div key={g.title}>
                <p className={cn("mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]", g.tone)}>
                  {g.title} · {g.rows.length}
                </p>
                <ul className="space-y-2">
                  {g.rows.map((l) => {
                    const nba = nextBestAction(l, now);
                    return (
                      <li key={l.id}>
                        <button
                          onClick={() => onOpen(l.id)}
                          className="flex w-full flex-col gap-1 rounded-xl border border-line px-3 py-2.5 text-left transition hover:border-teal sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span>
                            <span className="font-medium">{l.name}</span>{" "}
                            <span className="text-xs capitalize text-mute">· {label(l.productLine)} · {compactMoney(leadValue(l))}</span>
                            <span className="block text-xs text-ink/80">→ {nba.label}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            {l.nextActionAt ? <span className="text-xs text-mute">{formatDate(l.nextActionAt)}</span> : null}
                            <ScorePill lead={l} now={now} />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null,
          )}
          {groups.every((g) => !g.rows.length) ? <Empty title="Inbox zero." hint="Capture a lead to fill tomorrow's pipeline." /> : null}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="font-display text-xl">Target pace</h2>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-sand">
            <div className={cn("h-full", forecast.onTrack ? "bg-teal" : "bg-gold")} style={{ width: `${Math.min(100, forecast.progress * 100)}%` }} />
          </div>
          <p className="mt-3 text-sm">
            Run-rate lands at <span className="font-medium">{compactMoney(forecast.projected)}</span> ({pct(forecast.projectedProgress, 0)} of target).
          </p>
          <p className="mt-1 text-sm text-mute">
            {forecast.onTrack
              ? "On track — protect it with renewals."
              : `Need ${compactMoney(forecast.monthlyPaceNeeded)}/month for the next ${forecast.monthsLeft} months to close a ${compactMoney(forecast.gap)} gap.`}
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-xl">Renewals this month</h2>
          {urgentRenewals.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {urgentRenewals.map((r) => (
                <li key={r.policy.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
                  <span>
                    <span className="font-medium">{r.policy.participantName}</span>
                    <span className="block text-xs text-mute">
                      {r.policy.number} · {r.daysToExpiry < 0 ? `expired ${-r.daysToExpiry}d ago` : `${r.daysToExpiry}d left`}
                    </span>
                  </span>
                  <RiskBadge level={r.riskLabel} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-mute">Nothing expiring in the next 30 days.</p>
          )}
        </Card>

        <QuickCapture agentId={agentId} now={now} />
      </div>
    </div>
  );
}

function QuickCapture({ agentId, now }: { agentId: string; now: Date }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+2547");
  const [productLine, setProductLine] = useState<ProductLine>("motor");
  const [source, setSource] = useState<LeadSource>("referral");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState("");

  function save() {
    if (!name.trim() || phone.replace(/\D/g, "").length < 9) return;
    platformStore.addLead({
      id: `ld-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      phone: phone.trim(),
      productLine,
      status: "new",
      agentId,
      notes: notes.trim(),
      source,
      value: Number(value) || undefined,
      createdAt: new Date().toISOString(),
      nextActionAt: addDays(now, 1),
    });
    setSaved(`${name.trim()} added — follow-up booked for tomorrow.`);
    setName("");
    setNotes("");
    setValue("");
    setPhone("+2547");
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-display text-xl">Capture lead</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className={inputClass} value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Interest">
          <select className={inputClass} value={productLine} onChange={(e) => setProductLine(e.target.value as ProductLine)}>
            {LINES.map((l) => (
              <option key={l} value={l}>
                {label(l)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source">
          <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value as LeadSource)}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Est. annual contribution (KES, optional)">
        <input className={inputClass} value={value} inputMode="numeric" onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} />
      </Field>
      <Field label="Notes">
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button onClick={save}>Save lead</Button>
      {saved ? <p className="text-sm text-teal">{saved}</p> : null}
    </Card>
  );
}

/* -------------------------------------------------------------- Pipeline */

function PipelineTab({ leads, now, onOpen }: { leads: Lead[]; now: Date; onOpen: (id: string) => void }) {
  const summary = pipelineSummary(leads);
  const columns: LeadStatus[] = ["new", "contacted", "quoted", "won", "lost"];
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      {columns.map((stage) => {
        const rows = leads
          .filter((l) => l.status === stage)
          .sort((a, b) => scoreLead(b, now).score - scoreLead(a, now).score);
        return (
          <div key={stage} className="rounded-2xl border border-line bg-sand/40 p-3">
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-sm font-medium capitalize">{stage}</p>
              <p className="text-xs text-mute">
                {summary[stage].count} · {compactMoney(summary[stage].value)}
                {OPEN_STAGES.includes(stage) ? ` · ${pct(STAGE_PROBABILITY[stage], 0)}` : ""}
              </p>
            </div>
            <div className="space-y-2">
              {rows.map((l) => (
                <button
                  key={l.id}
                  onClick={() => onOpen(l.id)}
                  className="block w-full rounded-xl border border-line bg-surface p-3 text-left shadow-soft transition hover:border-teal"
                >
                  <p className="text-sm font-medium">{l.name}</p>
                  <p className="text-xs capitalize text-mute">
                    {label(l.productLine)} · {compactMoney(leadValue(l))}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <ScorePill lead={l} now={now} />
                    {l.nextActionAt && OPEN_STAGES.includes(l.status) ? (
                      <span className={cn("text-[11px]", daysUntil(l.nextActionAt, now) < 0 ? "text-danger" : "text-mute")}>
                        {formatDate(l.nextActionAt)}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
              {!rows.length ? <p className="px-1 py-4 text-center text-xs text-mute">Empty</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- Lead drawer */

const ACTIVITY_KINDS: LeadActivity["kind"][] = ["call", "whatsapp", "sms", "meeting", "note"];

function LeadDrawer({ lead, agentName, now, onClose }: { lead: Lead; agentName: string; now: Date; onClose: () => void }) {
  const score = scoreLead(lead, now);
  const nba = nextBestAction(lead, now);
  const [kind, setKind] = useState<LeadActivity["kind"]>("call");
  const [summary, setSummary] = useState("");
  const [followUp, setFollowUp] = useState(lead.nextActionAt ?? addDays(now, 2));
  const [lostReason, setLostReason] = useState("");
  const first = lead.name.split(" ")[0];
  const waText = `Habari ${first}, this is ${agentName} from InsuraX. Following up on your ${label(lead.productLine)} cover — can I share your quotation?`;

  function log() {
    if (!summary.trim()) return;
    platformStore.logLeadActivity(
      lead.id,
      { kind, summary: summary.trim() },
      { nextActionAt: followUp, ...(lead.status === "new" && kind !== "note" ? { status: "contacted" as const } : {}) },
    );
    setSummary("");
  }

  function move(status: LeadStatus) {
    platformStore.logLeadActivity(
      lead.id,
      { kind: "status", summary: `Moved to ${status}${status === "lost" && lostReason ? ` — ${lostReason}` : ""}` },
      { status, ...(status === "lost" ? { lostReason: lostReason || "Not specified" } : {}) },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-surface p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
        aria-label={`Lead ${lead.name}`}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-teal">{label(lead.productLine)} lead</p>
            <h2 className="font-display text-3xl text-forest">{lead.name}</h2>
            <p className="text-sm text-mute">
              {lead.phone}
              {lead.source ? ` · ${label(lead.source)}` : ""} · {compactMoney(leadValue(lead))}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 text-2xl leading-none text-mute hover:text-ink" aria-label="Close">
            ×
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge status={lead.status} />
          <ScorePill lead={lead} now={now} />
        </div>
        <p className="mt-2 text-xs text-mute">{score.reasons.join(" · ")}</p>
        {lead.notes ? <p className="mt-3 rounded-xl bg-sand/60 p-3 text-sm">{lead.notes}</p> : null}

        {OPEN_STAGES.includes(lead.status) ? (
          <div className="mt-4 rounded-xl border border-teal/30 bg-teal/5 p-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal">Next best action</p>
            <p className="mt-1 font-medium">{nba.label}</p>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button variant="secondary" href={`tel:${lead.phone}`} className="!px-2">
            Call
          </Button>
          <a
            href={whatsappLink(lead.phone, waText)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-line bg-white px-2 py-2.5 text-sm font-medium text-ink transition hover:border-teal hover:text-teal"
          >
            WhatsApp
          </a>
          <Button href={`/app/quotes/new?lead=${lead.id}`} className="!px-2">
            Quote
          </Button>
        </div>

        {OPEN_STAGES.includes(lead.status) ? (
          <div className="mt-6 space-y-3">
            <h3 className="font-display text-xl">Log touch</h3>
            <div className="flex flex-wrap gap-1">
              {ACTIVITY_KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs capitalize",
                    kind === k ? "border-teal bg-teal text-white" : "border-line text-mute",
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
            <textarea
              className={inputClass}
              rows={2}
              placeholder="What happened? What did they object to?"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <Field label="Next follow-up">
              <input type="date" className={inputClass} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
            </Field>
            <Button onClick={log} disabled={!summary.trim()}>
              Save activity
            </Button>

            <div className="border-t border-line pt-4">
              <p className="mb-2 text-sm font-medium">Move stage</p>
              <div className="flex flex-wrap gap-1">
                {(["contacted", "quoted", "won"] as LeadStatus[])
                  .filter((s) => s !== lead.status)
                  .map((s) => (
                    <Button key={s} variant="ghost" className="!px-2 !py-1 text-xs capitalize" onClick={() => move(s)}>
                      {s}
                    </Button>
                  ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  className={inputClass}
                  placeholder="Lost reason (price, timing, competitor…)"
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                />
                <Button variant="danger" className="!px-3 !py-1 text-xs" onClick={() => move("lost")}>
                  Lost
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <Button variant="secondary" onClick={() => move("contacted")}>
              Reopen lead
            </Button>
          </div>
        )}

        <h3 className="mt-8 font-display text-xl">Timeline</h3>
        <ol className="mt-3 space-y-3 border-l border-line pl-4 text-sm">
          {(lead.activities ?? []).map((a) => (
            <li key={a.id}>
              <p className="text-xs text-mute">
                <span className="capitalize">{a.kind}</span> · {formatDate(a.at)}
              </p>
              <p>{a.summary}</p>
            </li>
          ))}
          {lead.createdAt ? (
            <li>
              <p className="text-xs text-mute">Created · {formatDate(lead.createdAt)}</p>
            </li>
          ) : null}
          {!lead.activities?.length && !lead.createdAt ? <li className="text-mute">No activity yet.</li> : null}
        </ol>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------- Renewals */

function RiskBadge({ level }: { level: RenewalItem["riskLabel"] }) {
  const tone = { high: "bg-rose-50 text-rose-700 border-rose-200", medium: "bg-gold/15 text-[#8a6d12] border-gold/30", low: "bg-teal/10 text-teal border-teal/20" }[level];
  return <span className={cn("rounded-lg border px-2 py-0.5 text-xs capitalize", tone)}>{level} risk</span>;
}

function RenewalsTab({ items, agentId, persistency: rate }: { items: RenewalItem[]; agentId: string; persistency: number }) {
  const { leads } = usePlatform();
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const buckets: { key: RenewalItem["bucket"]; title: string }[] = [
    { key: "win_back", title: "Win-back (expired ≤60d)" },
    { key: "0-30", title: "0–30 days" },
    { key: "31-60", title: "31–60 days" },
    { key: "61-90", title: "61–90 days" },
  ];

  function remind(r: RenewalItem) {
    pushNotification({
      channel: "whatsapp",
      title: "Renewal reminder",
      body: `${r.policy.productName} (${r.policy.number}) ${r.daysToExpiry < 0 ? "has expired" : `renews on ${formatDate(r.policy.expiry)}`}. Reply YES to renew via M-Pesa.`,
      href: `/app/policies/${r.policy.id}`,
    });
    setSent((s) => ({ ...s, [r.policy.id]: true }));
  }

  function toPipeline(r: RenewalItem) {
    const participant = participants.find((p) => p.id === r.policy.participantId);
    platformStore.addLead({
      id: `ld-${crypto.randomUUID().slice(0, 8)}`,
      name: r.policy.participantName,
      phone: participant?.phone ?? "",
      productLine: lineOf(r.policy.productId) ?? "motor",
      status: "contacted",
      agentId,
      notes: `Renewal of ${r.policy.number} — expiry ${r.policy.expiry}.`,
      value: r.policy.frequency === "monthly" ? r.policy.contribution * 12 : r.policy.contribution,
      source: "renewal",
      createdAt: new Date().toISOString(),
      nextActionAt: new Date().toISOString().slice(0, 10),
    });
  }

  const inPipeline = (number: string) => leads.some((l) => l.source === "renewal" && l.notes.includes(number));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Persistency" value={pct(rate, 0)} hint="Book still in force" />
        <Stat label="Premium up for renewal" value={compactMoney(items.reduce((s, r) => s + r.policy.contribution, 0))} />
        <Stat label="High lapse risk" value={String(items.filter((r) => r.riskLabel === "high").length)} hint="Call these first" />
      </div>
      {buckets.map((b) => {
        const rows = items.filter((r) => r.bucket === b.key);
        if (!rows.length) return null;
        return (
          <Card key={b.key} className="p-2">
            <h2 className="px-3 pt-3 font-display text-xl">{b.title}</h2>
            <Table headers={["Policy", "Client", "Expiry", "Contribution", "Lapse risk", ""]}>
              {rows.map((r) => (
                <tr key={r.policy.id} className="border-b border-line/70">
                  <td className="px-3 py-3">
                    <Link href={`/app/policies/${r.policy.id}`} className="font-medium text-teal">
                      {r.policy.number}
                    </Link>
                    <div className="text-xs text-mute">{r.policy.productName}</div>
                  </td>
                  <td className="px-3 py-3">{r.policy.participantName}</td>
                  <td className="px-3 py-3 text-sm">
                    {formatDate(r.policy.expiry)}
                    <div className="text-xs text-mute">{r.daysToExpiry < 0 ? `${-r.daysToExpiry}d ago` : `${r.daysToExpiry}d left`}</div>
                  </td>
                  <td className="px-3 py-3">
                    {money(r.policy.contribution)}
                    <div className="text-xs text-mute">{r.policy.frequency}</div>
                  </td>
                  <td className="px-3 py-3">
                    <RiskBadge level={r.riskLabel} />
                    <div className="mt-1 max-w-[14rem] text-xs text-mute">{r.drivers.join(" · ") || "Clean payment history"}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => remind(r)} disabled={sent[r.policy.id]}>
                        {sent[r.policy.id] ? "Reminder sent" : "WhatsApp reminder"}
                      </Button>
                      <Button
                        variant="secondary"
                        className="!px-2 !py-1 text-xs"
                        onClick={() => toPipeline(r)}
                        disabled={inPipeline(r.policy.number)}
                      >
                        {inPipeline(r.policy.number) ? "In pipeline" : "Work renewal"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        );
      })}
      {!items.length ? (
        <Card>
          <Empty title="No renewals in the next 90 days." hint="Your book is quiet — a good week to prospect." />
        </Card>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- Book & x-sell */

function BookTab({
  book,
  rows,
  agentId,
  quotes,
}: {
  book: ReturnType<typeof usePlatform>["policies"];
  rows: ReturnType<typeof crossSell>;
  agentId: string;
  quotes: number;
}) {
  const { leads } = usePlatform();
  const opportunity = rows.reduce((s, r) => s + r.suggestions.reduce((x, y) => x + y.value, 0), 0);
  const already = (phone: string, line: ProductLine) => leads.some((l) => l.phone === phone && l.productLine === line && l.agentId === agentId);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
      <Card className="p-2">
        <h2 className="px-3 pt-3 font-display text-xl">My book</h2>
        <p className="px-3 text-xs text-mute">
          {book.length} policies · {quotes} quotes · {compactMoney(book.reduce((s, p) => s + p.contribution, 0))} contribution
        </p>
        <Table headers={["Policy", "Client", "Product", "Status"]}>
          {book.map((p) => (
            <tr key={p.id} className="border-b border-line/70">
              <td className="px-3 py-3">
                <Link href={`/app/policies/${p.id}`} className="font-medium text-teal">
                  {p.number}
                </Link>
              </td>
              <td className="px-3 py-3">{p.participantName}</td>
              <td className="px-3 py-3 text-sm">{p.productName}</td>
              <td className="px-3 py-3">
                <Badge status={p.status} />
              </td>
            </tr>
          ))}
        </Table>
        {!book.length ? <Empty title="No policies yet." hint="Bind a quote to start your book." /> : null}
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-xl">Cross-sell radar</h2>
        <p className="text-xs text-mute">
          Coverage gaps in your existing clients — {compactMoney(opportunity)} of annual contribution you don&apos;t need to prospect for.
        </p>
        <div className="mt-4 space-y-3">
          {rows.map((r) => (
            <div key={r.participant.id} className="rounded-xl border border-line p-3">
              <div className="flex items-baseline justify-between">
                <p className="font-medium">{r.participant.name}</p>
                <p className="text-xs capitalize text-mute">has {r.owned.map(label).join(", ")}</p>
              </div>
              <ul className="mt-2 space-y-1.5">
                {r.suggestions.map((s) => (
                  <li key={s.line} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="font-medium capitalize">{label(s.line)}</span>
                      <span className="text-mute"> — {s.reason}</span>
                    </span>
                    <Button
                      variant="ghost"
                      className="!px-2 !py-1 text-xs"
                      disabled={already(r.participant.phone, s.line)}
                      onClick={() =>
                        platformStore.addLead({
                          id: `ld-${crypto.randomUUID().slice(0, 8)}`,
                          name: r.participant.name,
                          phone: r.participant.phone,
                          productLine: s.line,
                          status: "new",
                          agentId,
                          notes: `Cross-sell: ${s.reason}`,
                          value: s.value,
                          source: "referral",
                          createdAt: new Date().toISOString(),
                          nextActionAt: new Date().toISOString().slice(0, 10),
                        })
                      }
                    >
                      {already(r.participant.phone, s.line) ? "In pipeline" : "+ Lead"}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!rows.length ? <Empty title="No gaps found." hint="Every client is fully covered." /> : null}
        </div>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------- Commissions */

function CommissionsTab({
  statement,
  wallet,
  onWithdraw,
}: {
  statement: ReturnType<typeof commissionStatement>;
  wallet: number;
  onWithdraw: (amount: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const value = Math.min(wallet, Number(amount) || 0);
  return (
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <Card className="p-2">
        <h2 className="px-3 pt-3 font-display text-xl">Commission statement</h2>
        <p className="px-3 text-xs text-mute">Earned on collected contributions only. First-year lapses claw back the unexpired share.</p>
        <Table headers={["Policy", "Line", "Collected", "Rate", "Earned", "Clawback", "Net"]}>
          {statement.lines.map((l) => (
            <tr key={l.policyId} className="border-b border-line/70">
              <td className="px-3 py-3">
                <span className="font-medium">{l.policyNumber}</span>
                <div className="text-xs text-mute">{l.client}</div>
              </td>
              <td className="px-3 py-3 text-sm capitalize">{l.line ? label(l.line) : "—"}</td>
              <td className="px-3 py-3">{money(l.collected)}</td>
              <td className="px-3 py-3">{pct(l.rate)}</td>
              <td className="px-3 py-3">{money(l.earned)}</td>
              <td className="px-3 py-3 text-danger">{l.clawback ? `−${money(l.clawback)}` : "—"}</td>
              <td className="px-3 py-3 font-medium">{money(l.net)}</td>
            </tr>
          ))}
          <tr className="font-medium">
            <td className="px-3 py-3" colSpan={2}>
              Total
            </td>
            <td className="px-3 py-3">{money(statement.totals.collected)}</td>
            <td />
            <td className="px-3 py-3">{money(statement.totals.earned)}</td>
            <td className="px-3 py-3 text-danger">{statement.totals.clawback ? `−${money(statement.totals.clawback)}` : "—"}</td>
            <td className="px-3 py-3">{money(statement.totals.net)}</td>
          </tr>
        </Table>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-display text-xl">Withdraw to M-Pesa</h2>
        <p className="text-sm text-mute">
          Available: <span className="font-medium text-ink">{money(wallet)}</span>
        </p>
        <Field label="Amount (KES)">
          <input className={inputClass} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <div className="flex gap-2">
          {[0.25, 0.5, 1].map((f) => (
            <Button key={f} variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setAmount(String(Math.floor(wallet * f)))}>
              {f === 1 ? "All" : pct(f, 0)}
            </Button>
          ))}
        </div>
        <Button
          disabled={value <= 0}
          onClick={() => {
            onWithdraw(value);
            setAmount("");
          }}
        >
          Withdraw {value > 0 ? money(value) : ""}
        </Button>
        <p className="text-xs text-mute">Posts a journal entry and SMS receipt on the live ledger.</p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Team */

function TeamTab({ rows, currentId }: { rows: ReturnType<typeof leaderboard>; currentId: string }) {
  return (
    <Card className="p-2">
      <h2 className="px-3 pt-3 font-display text-xl">Leaderboard</h2>
      <p className="px-3 text-xs text-mute">Ranked by target attainment, not raw volume — so every branch can win.</p>
      <Table headers={["#", "Agent", "Branch", "YTD GWP", "Target", "Attainment"]}>
        {rows.map((r) => (
          <tr key={r.agent.id} className={cn("border-b border-line/70", r.agent.id === currentId && "bg-teal/5")}>
            <td className="px-3 py-3 font-display text-xl">{r.rank}</td>
            <td className="px-3 py-3">
              {r.agent.name}
              {r.agent.id === currentId ? <span className="ml-2 text-xs text-teal">you</span> : null}
            </td>
            <td className="px-3 py-3 text-sm">{r.agent.branch}</td>
            <td className="px-3 py-3">{compactMoney(r.gwp)}</td>
            <td className="px-3 py-3">{compactMoney(r.agent.target)}</td>
            <td className="w-48 px-3 py-3">
              <div className="h-2 overflow-hidden rounded-full bg-sand">
                <div className="h-full bg-teal" style={{ width: `${Math.min(100, r.attainment * 100)}%` }} />
              </div>
              <span className="text-xs text-mute">{pct(r.attainment, 0)}</span>
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
