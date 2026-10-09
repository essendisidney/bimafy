import type {
  Agent,
  Lead,
  LeadSource,
  LeadStatus,
  Participant,
  Payment,
  Policy,
  ProductLine,
} from "../types";

/**
 * InsuraX Agent engine: lead scoring, follow-up agenda, renewals, commission
 * statements, target forecasting and cross-sell. Pure functions — every
 * time-dependent call takes `now` so the desk is reproducible and testable.
 */

const DAY = 86_400_000;

/** First-year agent commission by product line (IRA-style schedule). */
export const COMMISSION_RATES: Record<ProductLine, number> = {
  motor: 0.1,
  medical: 0.075,
  family_takaful: 0.15,
  funeral: 0.15,
  agriculture: 0.1,
  livestock: 0.1,
  travel: 0.15,
  gadget: 0.125,
  micro: 0.125,
  asset: 0.1,
};

export function commissionRate(line?: ProductLine) {
  return line ? COMMISSION_RATES[line] : 0.1;
}

export const STAGES: LeadStatus[] = ["new", "contacted", "quoted", "won", "lost"];
export const OPEN_STAGES: LeadStatus[] = ["new", "contacted", "quoted"];

/** Probability a lead in each stage binds — used for weighted pipeline. */
export const STAGE_PROBABILITY: Record<LeadStatus, number> = {
  new: 0.1,
  contacted: 0.25,
  quoted: 0.5,
  won: 1,
  lost: 0,
};

/** Typical annual contribution per line when the agent hasn't estimated one. */
export const DEFAULT_LEAD_VALUE: Record<ProductLine, number> = {
  motor: 60000,
  medical: 18000,
  family_takaful: 24000,
  funeral: 6000,
  agriculture: 30000,
  livestock: 15000,
  travel: 8000,
  gadget: 7000,
  micro: 10800,
  asset: 40000,
};

export function leadValue(lead: Pick<Lead, "value" | "productLine">) {
  return lead.value && lead.value > 0 ? lead.value : DEFAULT_LEAD_VALUE[lead.productLine];
}

function startOfDay(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole days from `now` to `iso` (negative = in the past). */
export function daysUntil(iso: string, now: Date) {
  return Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / DAY);
}

export function isOpen(lead: Pick<Lead, "status">) {
  return OPEN_STAGES.includes(lead.status);
}

function lastTouch(lead: Lead) {
  const times = (lead.activities ?? []).map((a) => new Date(a.at).getTime());
  if (lead.createdAt) times.push(new Date(lead.createdAt).getTime());
  return times.length ? Math.max(...times) : undefined;
}

const SOURCE_POINTS: Record<LeadSource, number> = {
  referral: 18,
  renewal: 18,
  walk_in: 12,
  whatsapp: 10,
  partner: 10,
  ussd: 6,
  campaign: 4,
  bulk_import: 2,
};

export type LeadTemperature = "hot" | "warm" | "cold";

/**
 * Why a lead scored the way it did. Codes, not sentences, so the desk can
 * render them in the agent's language (see lib/i18n/agency.ts).
 */
export type ScoreReason =
  | { code: "bound" }
  | { code: "lost"; detail?: string }
  | { code: "stage"; detail: LeadStatus }
  | { code: "source"; detail: LeadSource }
  | { code: "high_value" }
  | { code: "engaged" }
  | { code: "idle"; n: number }
  | { code: "overdue"; n: number }
  | { code: "no_followup" };

export type LeadScore = { score: number; temperature: LeadTemperature; reasons: ScoreReason[] };

/** 0–100 propensity-to-bind score with the reasons behind it. */
export function scoreLead(lead: Lead, now: Date = new Date()): LeadScore {
  if (lead.status === "won") return { score: 100, temperature: "hot", reasons: [{ code: "bound" }] };
  if (lead.status === "lost") return { score: 0, temperature: "cold", reasons: [{ code: "lost", detail: lead.lostReason }] };

  const reasons: ScoreReason[] = [];
  let score = { new: 20, contacted: 35, quoted: 55 }[lead.status as "new" | "contacted" | "quoted"];
  reasons.push({ code: "stage", detail: lead.status });

  if (lead.source) {
    score += SOURCE_POINTS[lead.source];
    if (SOURCE_POINTS[lead.source] >= 12) reasons.push({ code: "source", detail: lead.source });
  }

  const value = leadValue(lead);
  if (value >= 100_000) {
    score += 10;
    reasons.push({ code: "high_value" });
  } else if (value >= 30_000) {
    score += 5;
  }

  const touch = lastTouch(lead);
  if (touch !== undefined) {
    const idle = Math.floor((now.getTime() - touch) / DAY);
    if (idle <= 3) {
      score += 10;
      reasons.push({ code: "engaged" });
    } else if (idle > 21) {
      score -= 15;
      reasons.push({ code: "idle", n: idle });
    }
  }

  if (lead.nextActionAt) {
    const due = daysUntil(lead.nextActionAt, now);
    if (due < 0) {
      score -= 10;
      reasons.push({ code: "overdue", n: -due });
    } else if (due <= 1) {
      score += 5;
    }
  } else {
    score -= 5;
    reasons.push({ code: "no_followup" });
  }

  score = Math.max(1, Math.min(99, Math.round(score)));
  const temperature: LeadTemperature = score >= 65 ? "hot" : score >= 40 ? "warm" : "cold";
  return { score, temperature, reasons };
}

export type NextAction = {
  code: "first_call" | "price_quote" | "close" | "whatsapp_quote" | "none";
  channel: "call" | "whatsapp" | "quote" | "close" | "none";
  due: "overdue" | "today" | "upcoming" | "unscheduled" | "done";
};

export function nextBestAction(lead: Lead, now: Date = new Date()): NextAction {
  if (!isOpen(lead)) return { code: "none", channel: "none", due: "done" };
  const dueIn = lead.nextActionAt ? daysUntil(lead.nextActionAt, now) : undefined;
  const due: NextAction["due"] =
    dueIn === undefined ? "unscheduled" : dueIn < 0 ? "overdue" : dueIn === 0 ? "today" : "upcoming";

  if (lead.status === "new") return { code: "first_call", channel: "call", due };
  if (lead.status === "contacted") return { code: "price_quote", channel: "quote", due };
  const quotedTouches = (lead.activities ?? []).filter((a) => a.kind !== "status").length;
  if (quotedTouches >= 3) return { code: "close", channel: "close", due };
  return { code: "whatsapp_quote", channel: "whatsapp", due };
}

export type Agenda = { overdue: Lead[]; today: Lead[]; upcoming: Lead[]; unscheduled: Lead[] };

export function followUpAgenda(leads: Lead[], now: Date = new Date()): Agenda {
  const agenda: Agenda = { overdue: [], today: [], upcoming: [], unscheduled: [] };
  for (const lead of leads.filter(isOpen)) {
    if (!lead.nextActionAt) {
      agenda.unscheduled.push(lead);
      continue;
    }
    const d = daysUntil(lead.nextActionAt, now);
    if (d < 0) agenda.overdue.push(lead);
    else if (d === 0) agenda.today.push(lead);
    else if (d <= 7) agenda.upcoming.push(lead);
  }
  const byScore = (a: Lead, b: Lead) => scoreLead(b, now).score - scoreLead(a, now).score;
  agenda.overdue.sort(byScore);
  agenda.today.sort(byScore);
  agenda.unscheduled.sort(byScore);
  agenda.upcoming.sort((a, b) => (a.nextActionAt ?? "").localeCompare(b.nextActionAt ?? ""));
  return agenda;
}

export type PipelineSummary = Record<LeadStatus, { count: number; value: number }> & {
  weighted: number;
  winRate: number;
};

export function pipelineSummary(leads: Lead[]): PipelineSummary {
  const out = Object.fromEntries(STAGES.map((s) => [s, { count: 0, value: 0 }])) as unknown as PipelineSummary;
  let weighted = 0;
  for (const lead of leads) {
    const v = leadValue(lead);
    out[lead.status].count += 1;
    out[lead.status].value += v;
    if (isOpen(lead)) weighted += v * STAGE_PROBABILITY[lead.status];
  }
  const closed = out.won.count + out.lost.count;
  out.weighted = Math.round(weighted);
  out.winRate = closed ? out.won.count / closed : 0;
  return out;
}

export type RenewalBucket = "win_back" | "0-30" | "31-60" | "61-90";
export type RenewalDriver =
  | { code: "failed_collections"; n: number }
  | { code: "policy_status"; detail: Policy["status"] }
  | { code: "instalment_payer"; detail: Policy["frequency"] }
  | { code: "expired"; n: number }
  | { code: "expires_soon" }
  | { code: "no_settled_payment" };
export type RenewalItem = {
  policy: Policy;
  daysToExpiry: number;
  bucket: RenewalBucket;
  /** 0–1 likelihood the client does not renew. */
  lapseRisk: number;
  riskLabel: "high" | "medium" | "low";
  drivers: RenewalDriver[];
};

const LAPSE_STATUSES = new Set(["lapsed", "suspended", "cancelled"]);

/**
 * Policies expiring within `horizonDays`, plus recently expired ones still
 * worth a win-back call (within `graceDays`). Sorted most urgent first.
 */
export function renewalQueue(
  policies: Policy[],
  payments: Payment[],
  now: Date = new Date(),
  horizonDays = 90,
  graceDays = 60,
): RenewalItem[] {
  const items: RenewalItem[] = [];
  for (const policy of policies) {
    if (policy.status === "cancelled") continue;
    const d = daysUntil(policy.expiry, now);
    if (d > horizonDays || d < -graceDays) continue;

    const drivers: RenewalDriver[] = [];
    let risk = 0.15;
    const mine = payments.filter((p) => p.policyNumber === policy.number);
    const failed = mine.filter((p) => p.status === "failed").length;
    if (failed) {
      risk += 0.25 * Math.min(failed, 2);
      drivers.push({ code: "failed_collections", n: failed });
    }
    if (LAPSE_STATUSES.has(policy.status)) {
      risk += 0.3;
      drivers.push({ code: "policy_status", detail: policy.status });
    }
    if (policy.frequency === "monthly" || policy.frequency === "weekly" || policy.frequency === "daily") {
      risk += 0.1;
      drivers.push({ code: "instalment_payer", detail: policy.frequency });
    }
    if (d < 0) {
      risk += 0.2;
      drivers.push({ code: "expired", n: -d });
    } else if (d <= 14) {
      risk += 0.1;
      drivers.push({ code: "expires_soon" });
    }
    if (!mine.some((p) => p.status === "completed" || p.status === "reconciled")) {
      risk += 0.1;
      drivers.push({ code: "no_settled_payment" });
    }
    const lapseRisk = Math.min(0.95, Math.round(risk * 100) / 100);
    const bucket: RenewalBucket = d < 0 ? "win_back" : d <= 30 ? "0-30" : d <= 60 ? "31-60" : "61-90";
    items.push({
      policy,
      daysToExpiry: d,
      bucket,
      lapseRisk,
      riskLabel: lapseRisk >= 0.5 ? "high" : lapseRisk >= 0.3 ? "medium" : "low",
      drivers,
    });
  }
  return items.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
}

/** Share of the book still in force (active or reinstated). */
export function persistency(policies: Policy[]) {
  const relevant = policies.filter((p) => p.status !== "draft" && p.status !== "pending_payment");
  if (!relevant.length) return 0;
  const inForce = relevant.filter((p) => p.status === "active" || p.status === "reinstated").length;
  return inForce / relevant.length;
}

export type CommissionLine = {
  policyId: string;
  policyNumber: string;
  client: string;
  line?: ProductLine;
  status: Policy["status"];
  rate: number;
  collected: number;
  earned: number;
  clawback: number;
  net: number;
};

export type CommissionStatement = {
  lines: CommissionLine[];
  totals: { collected: number; earned: number; clawback: number; net: number };
};

/**
 * Commission is earned on collected contributions only. Policies cancelled or
 * lapsed inside their first year claw back the unexpired share of what was paid.
 */
export function commissionStatement(
  policies: Policy[],
  payments: Payment[],
  lineOf: (productId: string) => ProductLine | undefined,
  now: Date = new Date(),
): CommissionStatement {
  const lines: CommissionLine[] = policies.map((policy) => {
    const line = lineOf(policy.productId);
    const rate = commissionRate(line);
    const collected = payments
      .filter((p) => p.policyNumber === policy.number && (p.status === "completed" || p.status === "reconciled"))
      .reduce((s, p) => s + p.amount, 0);
    const earned = Math.round(collected * rate);
    let clawback = 0;
    if (policy.status === "cancelled" || policy.status === "lapsed") {
      const monthsInForce = Math.max(0, (now.getTime() - new Date(policy.inception).getTime()) / (30.4375 * DAY));
      if (monthsInForce < 12) clawback = Math.round(earned * (1 - monthsInForce / 12));
    }
    return {
      policyId: policy.id,
      policyNumber: policy.number,
      client: policy.participantName,
      line,
      status: policy.status,
      rate,
      collected,
      earned,
      clawback,
      net: earned - clawback,
    };
  });
  const totals = lines.reduce(
    (t, l) => ({
      collected: t.collected + l.collected,
      earned: t.earned + l.earned,
      clawback: t.clawback + l.clawback,
      net: t.net + l.net,
    }),
    { collected: 0, earned: 0, clawback: 0, net: 0 },
  );
  return { lines, totals };
}

export type TargetForecast = {
  progress: number;
  projected: number;
  projectedProgress: number;
  gap: number;
  monthsLeft: number;
  monthlyPaceNeeded: number;
  onTrack: boolean;
};

/** Straight-line run-rate projection of year-end GWP against target. */
export function targetForecast(ytdGwp: number, target: number, now: Date = new Date()): TargetForecast {
  const year = now.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const elapsed = Math.max(1 / 365, (now.getTime() - start) / (end - start));
  const projected = Math.round(ytdGwp / elapsed);
  const gap = Math.max(0, target - ytdGwp);
  const monthsLeft = Math.max(0, Math.round((1 - elapsed) * 12 * 10) / 10);
  return {
    progress: target ? ytdGwp / target : 0,
    projected,
    projectedProgress: target ? projected / target : 0,
    gap,
    monthsLeft,
    monthlyPaceNeeded: monthsLeft > 0 ? Math.round(gap / monthsLeft) : gap,
    onTrack: projected >= target,
  };
}

export type CrossSellReason =
  | "drives_without_medical"
  | "boda_funeral"
  | "farmer_livestock"
  | "income_protection"
  | "complete_family_plan"
  | "vehicle_owner_assets"
  | "digital_travel";
export type CrossSellSuggestion = { line: ProductLine; reason: CrossSellReason; value: number; age?: number };
export type CrossSellRow = {
  participant: Participant;
  owned: ProductLine[];
  suggestions: CrossSellSuggestion[];
};

function ageOn(dob: string, now: Date) {
  return Math.floor((now.getTime() - new Date(dob).getTime()) / (365.25 * DAY));
}

/** Gap analysis over each client's in-force lines → next products to offer. */
export function crossSell(
  policies: Policy[],
  participants: Participant[],
  lineOf: (productId: string) => ProductLine | undefined,
  now: Date = new Date(),
): CrossSellRow[] {
  const rows: CrossSellRow[] = [];
  for (const participant of participants) {
    const held = policies.filter((p) => p.participantId === participant.id && p.status !== "cancelled");
    if (!held.length) continue;
    const owned = [...new Set(held.map((p) => lineOf(p.productId)).filter((l): l is ProductLine => Boolean(l)))];
    const has = (l: ProductLine) => owned.includes(l);
    const out: CrossSellSuggestion[] = [];
    const add = (line: ProductLine, reason: CrossSellReason, extra: { age?: number } = {}) => {
      if (!has(line) && !out.some((s) => s.line === line)) out.push({ line, reason, value: DEFAULT_LEAD_VALUE[line], ...extra });
    };
    const age = participant.dob ? ageOn(participant.dob, now) : undefined;

    if ((has("motor") || has("micro")) && !has("medical")) add("medical", "drives_without_medical");
    if (has("micro")) add("funeral", "boda_funeral");
    if (has("agriculture")) add("livestock", "farmer_livestock");
    if (has("medical") && !has("family_takaful") && age !== undefined && age >= 25 && age <= 55)
      add("family_takaful", "income_protection", { age });
    if (has("family_takaful")) add("funeral", "complete_family_plan");
    if (has("motor")) add("asset", "vehicle_owner_assets");
    if (has("gadget") && !has("travel")) add("travel", "digital_travel");

    if (out.length) rows.push({ participant, owned, suggestions: out.slice(0, 3) });
  }
  return rows.sort(
    (a, b) => b.suggestions.reduce((s, x) => s + x.value, 0) - a.suggestions.reduce((s, x) => s + x.value, 0),
  );
}

export type LeaderboardRow = { agent: Agent; gwp: number; attainment: number; rank: number };

export function leaderboard(
  agents: Agent[],
  deltas: Record<string, { wallet: number; gwp: number }>,
): LeaderboardRow[] {
  return agents
    .map((agent) => {
      const gwp = agent.ytdGwp + (deltas[agent.id]?.gwp ?? 0);
      return { agent, gwp, attainment: agent.target ? gwp / agent.target : 0, rank: 0 };
    })
    .sort((a, b) => b.attainment - a.attainment)
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

/** Kenyan MSISDN → wa.me / tel: friendly digits (2547XXXXXXXX). */
export function msisdn(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9 && (digits.startsWith("7") || digits.startsWith("1"))) return `254${digits}`;
  return digits;
}

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${msisdn(phone)}?text=${encodeURIComponent(text)}`;
}

export function addDays(now: Date, days: number) {
  return new Date(startOfDay(now) + days * DAY).toISOString().slice(0, 10);
}
