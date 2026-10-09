"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  type CrossSellRow,
  type CrossSellSuggestion,
  type LeadTemperature,
  type NextAction,
  type RenewalItem,
} from "@/lib/engines/agency";
import { pushNotification, withdrawCommission } from "@/lib/events/ledger";
import { compactMoney, money, pct } from "@/lib/format";
import {
  WA_TEMPLATE_NAMES,
  agencyCopy,
  crossSellMessage,
  formatDay,
  leadMessage,
  renewalMessage,
  type WaTemplate,
} from "@/lib/i18n/agency";
import { useLang, type Lang } from "@/lib/lang";
import { createLead, distributorKey, logLeadActivity, newLeadId, ownsLead, useLeads } from "@/lib/leads";
import { usePlatform } from "@/lib/store";
import type { Lead, LeadActivity, LeadSource, LeadStatus, ProductLine } from "@/lib/types";
import { LangToggle } from "@/components/lang-toggle";
import { Badge, Button, Card, Empty, Field, PageHeader, SkeletonRows, Stat, Table, cn, inputClass } from "@/components/ui";

const LINES: ProductLine[] = ["motor", "medical", "micro", "family_takaful", "funeral", "travel", "gadget", "agriculture", "livestock", "asset"];
const SOURCES: LeadSource[] = ["referral", "walk_in", "whatsapp", "partner", "ussd", "campaign", "renewal"];
const TABS = ["today", "pipeline", "renewals", "book", "commissions", "team"] as const;
type Tab = (typeof TABS)[number];

const lineOf = (productId: string) => products.find((p) => p.id === productId)?.line;
const firstName = (name: string) => name.split(" ")[0];
const today = () => new Date().toISOString().slice(0, 10);

function useCopy() {
  const lang = useLang();
  return { lang, t: agencyCopy[lang] };
}

const TEMP_STYLE: Record<LeadTemperature, string> = {
  hot: "bg-danger/10 text-danger border-danger/25",
  warm: "bg-gold/15 text-gold-ink border-gold/30",
  cold: "bg-sand text-mute border-line",
};

function ScorePill({ lead, now }: { lead: Lead; now: Date }) {
  const { t } = useCopy();
  const s = scoreLead(lead, now);
  return (
    <span
      title={s.reasons.map(t.reason).join(" · ")}
      className={cn("inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs", TEMP_STYLE[s.temperature])}
    >
      {t.temperature[s.temperature]} · {s.score}
    </span>
  );
}

/** Which language the message to the client goes out in — independent of the agent's screen language. */
function ClientLangPicker({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  const { t } = useCopy();
  return (
    <div className="flex items-center gap-2 text-xs text-mute">
      <span>{t.drawer.waClientLang}</span>
      <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label={t.drawer.waClientLang}>
        {(["en", "sw"] as Lang[]).map((l) => (
          <button
            key={l}
            onClick={() => onChange(l)}
            aria-pressed={value === l}
            className={cn("rounded-md px-2 py-0.5 font-medium", value === l ? "bg-teal text-on-accent" : "text-mute hover:text-ink")}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

function openWhatsApp(phone: string, text: string) {
  window.open(whatsappLink(phone, text), "_blank", "noopener");
}

export default function AgentPage() {
  // useSearchParams needs a Suspense boundary on a statically rendered page.
  return (
    <Suspense>
      <AgentDesk />
    </Suspense>
  );
}

function AgentDesk() {
  const { user } = useAuth();
  const params = useSearchParams();
  const { lang, t } = useCopy();
  const { quotes, policies, payments, balanceDeltas } = usePlatform();
  const { leads, loading: leadsLoading, error: leadsError, mode } = useLeads();
  const canSwitch = user?.role === "admin" || user?.role === "branch_manager";
  const [viewAgentId, setViewAgentId] = useState<string | null>(null);
  const agentKey = viewAgentId ?? user?.agentId;
  const agent = agents.find((a) => a.id === agentKey || a.dbId === agentKey) ?? agents[0];
  // A signed-in agent always owns leads under their own agents.id, even if they aren't in the demo roster.
  const leadOwner = mode === "supabase" && !viewAgentId && user?.agentId ? user.agentId : distributorKey(agent);
  const [tab, setTab] = useState<Tab>("today");
  // ?lead=<id> (e.g. from the ⌘K palette) opens that lead's drawer.
  const [openLeadId, setOpenLeadId] = useState<string | null>(() => params.get("lead"));
  // null = follow the agent's screen language.
  const [clientLangChoice, setClientLang] = useState<Lang | null>(null);
  const clientLang = clientLangChoice ?? lang;
  const [now] = useState(() => new Date());

  const delta = balanceDeltas[agent.id] ?? { wallet: 0, gwp: 0 };
  const liveWallet = agent.wallet + delta.wallet;
  const liveGwp = agent.ytdGwp + delta.gwp;
  const forecast = targetForecast(liveGwp, agent.target, now);

  const mine = leads.filter((l) => l.agentId === leadOwner || ownsLead(agent, l.agentId));
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
  const clientLangProps = { clientLang, setClientLang };

  return (
    <div>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title(firstName(agent.name))}
        description={t.description(agent.code, agent.branch, agent.license)}
        actions={
          <>
            <LangToggle />
            {canSwitch ? (
              <select
                className={cn(inputClass, "!w-auto")}
                value={agent.id}
                onChange={(e) => setViewAgentId(e.target.value)}
                aria-label={t.viewAgent}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Button href="/app/quotes/new">{t.newQuote}</Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label={t.stats.due} value={String(dueCount)} hint={t.stats.dueHint(agenda.overdue.length)} />
        <Stat
          label={t.stats.pipeline}
          value={compactMoney(pipeline.weighted)}
          hint={t.stats.pipelineHint(mine.filter((l) => OPEN_STAGES.includes(l.status)).length, pct(pipeline.winRate, 0))}
        />
        <Stat label={t.stats.renewals} value={String(renewals.length)} hint={t.stats.renewalsHint(atRisk)} />
        <Stat label={t.stats.gwp} value={compactMoney(liveGwp)} hint={t.stats.gwpHint(pct(forecast.progress, 0), compactMoney(agent.target))} />
        <Stat label={t.stats.wallet} value={money(liveWallet)} hint={t.stats.walletHint(money(statement.totals.net))} />
      </div>

      {leadsError ? (
        <p role="alert" className="mt-4 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">
          {leadsError}
        </p>
      ) : null}
      {mode === "supabase" && leadsLoading && !leads.length ? <Card className="mt-4"><SkeletonRows rows={3} label={t.loading} /></Card> : null}

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition",
              tab === key ? "border-teal font-medium text-teal" : "border-transparent text-mute hover:text-ink",
            )}
          >
            {t.tabs[key]}
            {key === "today" && dueCount ? <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[10px] text-on-accent">{dueCount}</span> : null}
            {key === "renewals" && atRisk ? <span className="ml-1.5 rounded-full bg-gold px-1.5 text-[10px] text-forest">{atRisk}</span> : null}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "today" ? (
          <TodayTab agentId={leadOwner} agenda={agenda} renewals={renewals} forecast={forecast} now={now} onOpen={setOpenLeadId} />
        ) : null}
        {tab === "pipeline" ? <PipelineTab leads={mine} now={now} onOpen={setOpenLeadId} /> : null}
        {tab === "renewals" ? (
          <RenewalsTab items={renewals} agentId={leadOwner} agentName={agent.name} persistency={persistency(book)} {...clientLangProps} />
        ) : null}
        {tab === "book" ? (
          <BookTab
            book={book}
            rows={xsell}
            agentId={leadOwner}
            agentName={agent.name}
            quotes={quotes.filter((q) => q.agentId === agent.id).length}
            {...clientLangProps}
          />
        ) : null}
        {tab === "commissions" ? (
          <CommissionsTab
            statement={statement}
            wallet={liveWallet}
            onWithdraw={(amount) => withdrawCommission({ distributorId: agent.id, name: agent.name, amount, kind: "agent" })}
          />
        ) : null}
        {tab === "team" ? <TeamTab rows={board} currentId={agent.id} /> : null}
      </div>

      {openLead ? (
        <LeadDrawer
          key={openLead.id}
          lead={openLead}
          agentName={agent.name}
          now={now}
          onClose={() => setOpenLeadId(null)}
          {...clientLangProps}
        />
      ) : null}
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
  const { lang, t } = useCopy();
  const urgentRenewals = renewals.filter((r) => r.daysToExpiry <= 30).slice(0, 4);
  const groups: { title: string; tone: string; rows: Lead[] }[] = [
    { title: t.today.overdue, tone: "text-danger", rows: agenda.overdue },
    { title: t.today.today, tone: "text-teal", rows: agenda.today },
    { title: t.today.unscheduled, tone: "text-mute", rows: agenda.unscheduled },
    { title: t.today.upcoming, tone: "text-mute", rows: agenda.upcoming },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Card className="p-5">
        <h2 className="font-display text-xl">{t.today.followUps}</h2>
        <p className="text-xs text-mute">{t.today.followUpsHint}</p>
        <div className="mt-4 space-y-5">
          {groups.map((g) =>
            g.rows.length ? (
              <div key={g.title}>
                <p className={cn("mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]", g.tone)}>
                  {g.title} · {g.rows.length}
                </p>
                <ul className="space-y-2">
                  {g.rows.map((l) => (
                    <li key={l.id}>
                      <button
                        onClick={() => onOpen(l.id)}
                        className="flex w-full flex-col gap-1 rounded-xl border border-line px-3 py-2.5 text-left transition hover:border-teal sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span>
                          <span className="font-medium">{l.name}</span>{" "}
                          <span className="text-xs text-mute">
                            · {t.line[l.productLine]} · {compactMoney(leadValue(l))}
                          </span>
                          <span className="block text-xs text-ink/80">→ {t.action[nextBestAction(l, now).code]}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          {l.nextActionAt ? <span className="text-xs text-mute">{formatDay(l.nextActionAt, lang)}</span> : null}
                          <ScorePill lead={l} now={now} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          {groups.every((g) => !g.rows.length) ? <Empty title={t.today.inboxZero} hint={t.today.inboxZeroHint} /> : null}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="font-display text-xl">{t.today.targetPace}</h2>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-sand">
            <div className={cn("h-full", forecast.onTrack ? "bg-teal" : "bg-gold")} style={{ width: `${Math.min(100, forecast.progress * 100)}%` }} />
          </div>
          <p className="mt-3 text-sm">{t.today.runRate(compactMoney(forecast.projected), pct(forecast.projectedProgress, 0))}</p>
          <p className="mt-1 text-sm text-mute">
            {forecast.onTrack
              ? t.today.onTrack
              : t.today.behind(compactMoney(forecast.monthlyPaceNeeded), forecast.monthsLeft, compactMoney(forecast.gap))}
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-xl">{t.today.renewalsMonth}</h2>
          {urgentRenewals.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {urgentRenewals.map((r) => (
                <li key={r.policy.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
                  <span>
                    <span className="font-medium">{r.policy.participantName}</span>
                    <span className="block text-xs text-mute">
                      {r.policy.number} · {r.daysToExpiry < 0 ? t.today.expiredAgo(-r.daysToExpiry) : t.today.daysLeft(r.daysToExpiry)}
                    </span>
                  </span>
                  <RiskBadge level={r.riskLabel} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-mute">{t.today.noRenewals}</p>
          )}
        </Card>

        <QuickCapture agentId={agentId} now={now} />
      </div>
    </div>
  );
}

function QuickCapture({ agentId, now }: { agentId: string; now: Date }) {
  const { t } = useCopy();
  const { operatorId } = useAuth();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+2547");
  const [productLine, setProductLine] = useState<ProductLine>("motor");
  const [source, setSource] = useState<LeadSource>("referral");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [savedName, setSavedName] = useState("");

  async function save() {
    if (saving || !name.trim() || phone.replace(/\D/g, "").length < 9) return;
    setSaving(true);
    const ok = await createLead(
      {
        id: newLeadId(),
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
      },
      operatorId,
    );
    setSaving(false);
    if (!ok) {
      setSavedName("");
      return;
    }
    setSavedName(name.trim());
    setName("");
    setNotes("");
    setValue("");
    setPhone("+2547");
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-display text-xl">{t.capture.title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.capture.name}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t.capture.phone}>
          <input className={inputClass} value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t.capture.interest}>
          <select className={inputClass} value={productLine} onChange={(e) => setProductLine(e.target.value as ProductLine)}>
            {LINES.map((l) => (
              <option key={l} value={l}>
                {t.line[l]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.capture.source}>
          <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value as LeadSource)}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {t.source[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t.capture.value}>
        <input className={inputClass} value={value} inputMode="numeric" onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} />
      </Field>
      <Field label={t.capture.notes}>
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button onClick={save} disabled={saving}>
        {saving ? t.capture.saving : t.capture.save}
      </Button>
      {savedName ? <p className="text-sm text-teal">{t.capture.saved(savedName)}</p> : null}
    </Card>
  );
}

/* -------------------------------------------------------------- Pipeline */

function PipelineTab({ leads, now, onOpen }: { leads: Lead[]; now: Date; onOpen: (id: string) => void }) {
  const { lang, t } = useCopy();
  const summary = pipelineSummary(leads);
  const columns: LeadStatus[] = ["new", "contacted", "quoted", "won", "lost"];
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      {columns.map((stage) => {
        const rows = leads.filter((l) => l.status === stage).sort((a, b) => scoreLead(b, now).score - scoreLead(a, now).score);
        return (
          <div key={stage} className="rounded-2xl border border-line bg-sand/40 p-3">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{t.status[stage]}</p>
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
                  <p className="text-xs text-mute">
                    {t.line[l.productLine]} · {compactMoney(leadValue(l))}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <ScorePill lead={l} now={now} />
                    {l.nextActionAt && OPEN_STAGES.includes(l.status) ? (
                      <span className={cn("text-[11px]", daysUntil(l.nextActionAt, now) < 0 ? "text-danger" : "text-mute")}>
                        {formatDay(l.nextActionAt, lang)}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
              {!rows.length ? <p className="px-1 py-4 text-center text-xs text-mute">{t.pipeline.empty}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- Lead drawer */

const ACTIVITY_KINDS: LeadActivity["kind"][] = ["call", "whatsapp", "sms", "meeting", "note"];
const TEMPLATES: WaTemplate[] = ["follow_up", "send_quote", "ask_payment", "thank_you"];

/** The message the next best action calls for. */
function suggestedTemplate(lead: Lead, action: NextAction["code"]): WaTemplate {
  if (lead.status === "won") return "thank_you";
  if (action === "close") return "ask_payment";
  if (action === "price_quote" || action === "whatsapp_quote") return "send_quote";
  return "follow_up";
}

type ClientLangProps = { clientLang: Lang; setClientLang: (l: Lang) => void };

function LeadDrawer({
  lead,
  agentName,
  now,
  onClose,
  clientLang,
  setClientLang,
}: { lead: Lead; agentName: string; now: Date; onClose: () => void } & ClientLangProps) {
  const { lang, t } = useCopy();
  const score = scoreLead(lead, now);
  const nba = nextBestAction(lead, now);
  const [kind, setKind] = useState<LeadActivity["kind"]>("call");
  const [summary, setSummary] = useState("");
  const [followUp, setFollowUp] = useState(lead.nextActionAt ?? addDays(now, 2));
  const [lostReason, setLostReason] = useState("");
  const [template, setTemplate] = useState<WaTemplate>(suggestedTemplate(lead, nba.code));
  // An edited draft sticks until the agent picks another template or language.
  const [draft, setDraft] = useState<string | null>(null);
  const message =
    draft ??
    leadMessage(template, clientLang, {
      first: firstName(lead.name),
      agent: agentName,
      line: lead.productLine,
      price: money(leadValue(lead)),
    });

  function log() {
    if (!summary.trim()) return;
    void logLeadActivity(
      lead.id,
      { kind, summary: summary.trim() },
      { nextActionAt: followUp, ...(lead.status === "new" && kind !== "note" ? { status: "contacted" as const } : {}) },
    );
    setSummary("");
  }

  function sendWhatsApp() {
    openWhatsApp(lead.phone, message);
    // The send is the touch: log it so the timeline and score stay honest without typing.
    void logLeadActivity(
      lead.id,
      { kind: "whatsapp", summary: t.drawer.waSent(WA_TEMPLATE_NAMES[lang][template]) },
      lead.status === "new" ? { status: "contacted" } : {},
    );
  }

  function move(status: LeadStatus) {
    const reason = status === "lost" ? lostReason || t.drawer.notSpecified : undefined;
    void logLeadActivity(
      lead.id,
      { kind: "status", summary: t.drawer.movedTo(t.status[status], reason) },
      { status, ...(reason ? { lostReason: reason } : {}) },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 animate-fade-in" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-surface p-6 shadow-lift animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
        aria-label={lead.name}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-teal">{t.drawer.lead(t.line[lead.productLine])}</p>
            <h2 className="font-display text-3xl text-heading">{lead.name}</h2>
            <p className="text-sm text-mute">
              {lead.phone}
              {lead.source ? ` · ${t.source[lead.source]}` : ""} · {compactMoney(leadValue(lead))}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 text-2xl leading-none text-mute hover:text-ink" aria-label={t.drawer.close}>
            ×
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge status={lead.status} label={t.status[lead.status]} />
          <ScorePill lead={lead} now={now} />
        </div>
        <p className="mt-2 text-xs text-mute">{score.reasons.map(t.reason).join(" · ")}</p>
        {lead.notes ? <p className="mt-3 rounded-xl bg-sand/60 p-3 text-sm">{lead.notes}</p> : null}

        {OPEN_STAGES.includes(lead.status) ? (
          <div className="mt-4 rounded-xl border border-teal/30 bg-teal/5 p-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal">{t.drawer.nextAction}</p>
            <p className="mt-1 font-medium">{t.action[nba.code]}</p>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" href={`tel:${lead.phone}`} className="!px-2">
            {t.drawer.call}
          </Button>
          <Button href={`/app/quotes/new?lead=${lead.id}`} className="!px-2">
            {t.drawer.quote}
          </Button>
        </div>

        <section className="mt-4 rounded-2xl border border-line p-4" aria-label={t.drawer.waTitle}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">{t.drawer.waTitle}</h3>
            <ClientLangPicker
              value={clientLang}
              onChange={(l) => {
                setClientLang(l);
                setDraft(null);
              }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl}
                onClick={() => {
                  setTemplate(tpl);
                  setDraft(null);
                }}
                aria-pressed={template === tpl}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-xs",
                  template === tpl ? "border-teal bg-teal text-on-accent" : "border-line text-mute hover:text-ink",
                )}
              >
                {WA_TEMPLATE_NAMES[lang][tpl]}
              </button>
            ))}
          </div>
          <textarea
            className={cn(inputClass, "mt-3")}
            rows={4}
            value={message}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={t.drawer.waTitle}
          />
          <button
            onClick={sendWhatsApp}
            disabled={!lead.phone || !message.trim()}
            className="mt-2 flex w-full items-center justify-center rounded-xl bg-[#1f8a4c] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {t.drawer.waSend}
          </button>
        </section>

        {OPEN_STAGES.includes(lead.status) ? (
          <div className="mt-6 space-y-3">
            <h3 className="font-display text-xl">{t.drawer.logTouch}</h3>
            <div className="flex flex-wrap gap-1">
              {ACTIVITY_KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={cn("rounded-lg border px-2.5 py-1 text-xs", kind === k ? "border-teal bg-teal text-on-accent" : "border-line text-mute")}
                >
                  {t.activity[k]}
                </button>
              ))}
            </div>
            <textarea
              className={inputClass}
              rows={2}
              placeholder={t.drawer.placeholder}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <Field label={t.drawer.nextFollowUp}>
              <input type="date" className={inputClass} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
            </Field>
            <Button onClick={log} disabled={!summary.trim()}>
              {t.drawer.saveActivity}
            </Button>

            <div className="border-t border-line pt-4">
              <p className="mb-2 text-sm font-medium">{t.drawer.moveStage}</p>
              <div className="flex flex-wrap gap-1">
                {(["contacted", "quoted", "won"] as LeadStatus[])
                  .filter((s) => s !== lead.status)
                  .map((s) => (
                    <Button key={s} variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => move(s)}>
                      {t.status[s]}
                    </Button>
                  ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input className={inputClass} placeholder={t.drawer.lostReason} value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
                <Button variant="danger" className="!px-3 !py-1 text-xs" onClick={() => move("lost")}>
                  {t.drawer.lost}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <Button variant="secondary" onClick={() => move("contacted")}>
              {t.drawer.reopen}
            </Button>
          </div>
        )}

        <h3 className="mt-8 font-display text-xl">{t.drawer.timeline}</h3>
        <ol className="mt-3 space-y-3 border-l border-line pl-4 text-sm">
          {(lead.activities ?? []).map((a) => (
            <li key={a.id}>
              <p className="text-xs text-mute">
                {t.activity[a.kind]} · {formatDay(a.at, lang)}
              </p>
              <p>{a.summary}</p>
            </li>
          ))}
          {lead.createdAt ? (
            <li>
              <p className="text-xs text-mute">
                {t.drawer.created} · {formatDay(lead.createdAt, lang)}
              </p>
            </li>
          ) : null}
          {!lead.activities?.length && !lead.createdAt ? <li className="text-mute">{t.drawer.noActivity}</li> : null}
        </ol>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------- Renewals */

function RiskBadge({ level }: { level: RenewalItem["riskLabel"] }) {
  const { t } = useCopy();
  const tone = {
    high: "bg-danger/10 text-danger border-danger/25",
    medium: "bg-gold/15 text-gold-ink border-gold/30",
    low: "bg-teal/10 text-teal border-teal/20",
  }[level];
  return <span className={cn("whitespace-nowrap rounded-lg border px-2 py-0.5 text-xs", tone)}>{t.renewals.risk[level]}</span>;
}

function RenewalsTab({
  items,
  agentId,
  agentName,
  persistency: rate,
  clientLang,
  setClientLang,
}: { items: RenewalItem[]; agentId: string; agentName: string; persistency: number } & ClientLangProps) {
  const { lang, t } = useCopy();
  const { leads } = useLeads();
  const { operatorId } = useAuth();
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const buckets: RenewalItem["bucket"][] = ["win_back", "0-30", "31-60", "61-90"];
  const phoneOf = (participantId: string) => participants.find((p) => p.id === participantId)?.phone ?? "";

  function remind(r: RenewalItem) {
    const text = renewalMessage(clientLang, {
      first: firstName(r.policy.participantName),
      agent: agentName,
      product: r.policy.productName,
      number: r.policy.number,
      expiry: r.policy.expiry,
      expired: r.daysToExpiry < 0,
    });
    openWhatsApp(phoneOf(r.policy.participantId), text);
    // Keep the reminder on the record (notifications feed + ledger events).
    pushNotification({ channel: "whatsapp", title: "Renewal reminder", body: text, href: `/app/policies/${r.policy.id}` });
    setSent((s) => ({ ...s, [r.policy.id]: true }));
  }

  function toPipeline(r: RenewalItem) {
    void createLead(
      {
        id: newLeadId(),
        name: r.policy.participantName,
        phone: phoneOf(r.policy.participantId),
        productLine: lineOf(r.policy.productId) ?? "motor",
        status: "contacted",
        agentId,
        notes: t.renewals.renewalNote(r.policy.number, r.policy.expiry),
        value: r.policy.frequency === "monthly" ? r.policy.contribution * 12 : r.policy.contribution,
        source: "renewal",
        createdAt: new Date().toISOString(),
        nextActionAt: today(),
      },
      operatorId,
    );
  }

  const inPipeline = (number: string) => leads.some((l) => l.source === "renewal" && l.notes.includes(number));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t.renewals.persistency} value={pct(rate, 0)} hint={t.renewals.persistencyHint} />
        <Stat label={t.renewals.premium} value={compactMoney(items.reduce((s, r) => s + r.policy.contribution, 0))} />
        <Stat label={t.renewals.highRisk} value={String(items.filter((r) => r.riskLabel === "high").length)} hint={t.renewals.highRiskHint} />
      </div>
      {items.length ? (
        <div className="flex justify-end">
          <ClientLangPicker value={clientLang} onChange={setClientLang} />
        </div>
      ) : null}
      {buckets.map((bucket) => {
        const rows = items.filter((r) => r.bucket === bucket);
        if (!rows.length) return null;
        return (
          <Card key={bucket} className="p-2">
            <h2 className="px-3 pt-3 font-display text-xl">{t.renewals.buckets[bucket]}</h2>
            <Table headers={t.renewals.headers}>
              {rows.map((r) => {
                const phone = phoneOf(r.policy.participantId);
                return (
                  <tr key={r.policy.id} className="border-b border-line/70">
                    <td className="px-3 py-3">
                      <Link href={`/app/policies/${r.policy.id}`} className="font-medium text-teal">
                        {r.policy.number}
                      </Link>
                      <div className="text-xs text-mute">{r.policy.productName}</div>
                    </td>
                    <td className="px-3 py-3">{r.policy.participantName}</td>
                    <td className="px-3 py-3 text-sm">
                      {formatDay(r.policy.expiry, lang)}
                      <div className="text-xs text-mute">{r.daysToExpiry < 0 ? t.renewals.ago(-r.daysToExpiry) : t.renewals.left(r.daysToExpiry)}</div>
                    </td>
                    <td className="px-3 py-3">
                      {money(r.policy.contribution)}
                      <div className="text-xs text-mute">{t.frequency[r.policy.frequency]}</div>
                    </td>
                    <td className="px-3 py-3">
                      <RiskBadge level={r.riskLabel} />
                      <div className="mt-1 max-w-[14rem] text-xs text-mute">{r.drivers.map(t.driver).join(" · ") || t.renewals.clean}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          className="!px-2 !py-1 text-xs"
                          onClick={() => remind(r)}
                          disabled={!phone}
                        >
                          {!phone ? t.renewals.noPhone : sent[r.policy.id] ? `✓ ${t.renewals.reminded}` : t.renewals.remind}
                        </Button>
                        <Button
                          variant="secondary"
                          className="!px-2 !py-1 text-xs"
                          onClick={() => toPipeline(r)}
                          disabled={inPipeline(r.policy.number)}
                        >
                          {inPipeline(r.policy.number) ? t.renewals.inPipeline : t.renewals.work}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        );
      })}
      {!items.length ? (
        <Card>
          <Empty title={t.renewals.empty} hint={t.renewals.emptyHint} />
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
  agentName,
  quotes,
  clientLang,
  setClientLang,
}: {
  book: ReturnType<typeof usePlatform>["policies"];
  rows: CrossSellRow[];
  agentId: string;
  agentName: string;
  quotes: number;
} & ClientLangProps) {
  const { t } = useCopy();
  const { leads } = useLeads();
  const { operatorId } = useAuth();
  const opportunity = rows.reduce((s, r) => s + r.suggestions.reduce((x, y) => x + y.value, 0), 0);
  const already = (phone: string, line: ProductLine) => leads.some((l) => l.phone === phone && l.productLine === line && l.agentId === agentId);

  function addLead(r: CrossSellRow, s: CrossSellSuggestion) {
    void createLead(
      {
        id: newLeadId(),
        name: r.participant.name,
        phone: r.participant.phone,
        productLine: s.line,
        status: "new",
        agentId,
        notes: t.book.crossSellNote(t.crossSell(s.reason, s.age)),
        value: s.value,
        source: "referral",
        createdAt: new Date().toISOString(),
        nextActionAt: today(),
      },
      operatorId,
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
      <Card className="p-2">
        <h2 className="px-3 pt-3 font-display text-xl">{t.book.title}</h2>
        <p className="px-3 text-xs text-mute">
          {t.book.summary(book.length, quotes, compactMoney(book.reduce((s, p) => s + p.contribution, 0)))}
        </p>
        <Table headers={t.book.headers}>
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
        {!book.length ? <Empty title={t.book.empty} hint={t.book.emptyHint} /> : null}
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-display text-xl">{t.book.radar}</h2>
          {rows.length ? <ClientLangPicker value={clientLang} onChange={setClientLang} /> : null}
        </div>
        <p className="mt-1 text-xs text-mute">{t.book.radarHint(compactMoney(opportunity))}</p>
        <div className="mt-4 space-y-3">
          {rows.map((r) => (
            <div key={r.participant.id} className="rounded-xl border border-line p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{r.participant.name}</p>
                <p className="text-right text-xs text-mute">{t.book.has(r.owned.map((l) => t.line[l].toLowerCase()).join(", "))}</p>
              </div>
              <ul className="mt-2 space-y-1.5">
                {r.suggestions.map((s) => {
                  const inPipe = already(r.participant.phone, s.line);
                  return (
                    <li key={s.line} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                      <span>
                        <span className="font-medium">{t.line[s.line]}</span>
                        <span className="text-mute"> — {t.crossSell(s.reason, s.age)}</span>
                      </span>
                      <span className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          className="!px-2 !py-1 text-xs"
                          onClick={() =>
                            openWhatsApp(
                              r.participant.phone,
                              crossSellMessage(clientLang, {
                                first: firstName(r.participant.name),
                                agent: agentName,
                                line: s.line,
                                reason: s.reason,
                                age: s.age,
                              }),
                            )
                          }
                        >
                          {t.book.whatsapp}
                        </Button>
                        <Button variant="ghost" className="!px-2 !py-1 text-xs" disabled={inPipe} onClick={() => addLead(r, s)}>
                          {inPipe ? t.book.inPipeline : t.book.addLead}
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!rows.length ? <Empty title={t.book.noGaps} hint={t.book.noGapsHint} /> : null}
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
  const { t } = useCopy();
  const [amount, setAmount] = useState("");
  const value = Math.min(wallet, Number(amount) || 0);
  return (
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <Card className="p-2">
        <h2 className="px-3 pt-3 font-display text-xl">{t.commissions.title}</h2>
        <p className="px-3 text-xs text-mute">{t.commissions.hint}</p>
        <Table headers={t.commissions.headers}>
          {statement.lines.map((l) => (
            <tr key={l.policyId} className="border-b border-line/70">
              <td className="px-3 py-3">
                <span className="font-medium">{l.policyNumber}</span>
                <div className="text-xs text-mute">{l.client}</div>
              </td>
              <td className="px-3 py-3 text-sm">{l.line ? t.line[l.line] : "—"}</td>
              <td className="px-3 py-3">{money(l.collected)}</td>
              <td className="px-3 py-3">{pct(l.rate)}</td>
              <td className="px-3 py-3">{money(l.earned)}</td>
              <td className="px-3 py-3 text-danger">{l.clawback ? `−${money(l.clawback)}` : "—"}</td>
              <td className="px-3 py-3 font-medium">{money(l.net)}</td>
            </tr>
          ))}
          <tr className="font-medium">
            <td className="px-3 py-3" colSpan={2}>
              {t.commissions.total}
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
        <h2 className="font-display text-xl">{t.commissions.withdraw}</h2>
        <p className="text-sm text-mute">
          {t.commissions.available}: <span className="font-medium text-ink">{money(wallet)}</span>
        </p>
        <Field label={t.commissions.amount}>
          <input className={inputClass} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <div className="flex gap-2">
          {[0.25, 0.5, 1].map((f) => (
            <Button key={f} variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setAmount(String(Math.floor(wallet * f)))}>
              {f === 1 ? t.commissions.all : pct(f, 0)}
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
          {t.commissions.withdrawCta(value > 0 ? money(value) : "")}
        </Button>
        <p className="text-xs text-mute">{t.commissions.ledgerNote}</p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Team */

function TeamTab({ rows, currentId }: { rows: ReturnType<typeof leaderboard>; currentId: string }) {
  const { t } = useCopy();
  return (
    <Card className="p-2">
      <h2 className="px-3 pt-3 font-display text-xl">{t.team.title}</h2>
      <p className="px-3 text-xs text-mute">{t.team.hint}</p>
      <Table headers={t.team.headers}>
        {rows.map((r) => (
          <tr key={r.agent.id} className={cn("border-b border-line/70", r.agent.id === currentId && "bg-teal/5")}>
            <td className="px-3 py-3 font-display text-xl">{r.rank}</td>
            <td className="px-3 py-3">
              {r.agent.name}
              {r.agent.id === currentId ? <span className="ml-2 text-xs text-teal">{t.team.you}</span> : null}
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
