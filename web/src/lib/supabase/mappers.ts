import type {
  Claim,
  ClaimStatus,
  Frequency,
  JournalEntry,
  Participant,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Policy,
  PolicyEndorsement,
  PolicyStatus,
  Product,
  ProductLine,
  Quote,
  QuoteStatus,
  TakafulModel,
  UwDecision,
  Channel,
} from "@/lib/types";

type DbProduct = {
  id: string;
  slug: string;
  code: string;
  name: string;
  line: string;
  description: string | null;
  takaful_model: string;
  contribution_frequencies: string[] | null;
  min_contribution: number | null;
  max_sum_covered: number | null;
  waiting_period_days: number;
  wakala_fee_rate: number | null;
  is_micro: boolean;
  shariah_approved: boolean;
  config: Record<string, unknown> | null;
};

type DbQuote = {
  id: string;
  quote_number: string;
  participant_id: string | null;
  agent_id: string | null;
  product_id: string;
  channel: string;
  status: string;
  risk_payload: Record<string, string | number | boolean> | null;
  sum_covered: number;
  base_contribution: number;
  wakala_fee: number;
  tabarru: number;
  taxes: number;
  levies: number;
  total_contribution: number;
  frequency: string;
  monthly_equivalent: number | null;
  uw_decision: string | null;
  uw_notes: string | null;
  valid_until: string | null;
  created_at: string;
};

type DbPolicy = {
  id: string;
  policy_number: string;
  quote_id?: string | null;
  participant_id: string;
  product_id: string;
  agent_id: string | null;
  status: string;
  channel: string;
  inception_date: string;
  expiry_date: string;
  sum_covered: number;
  contribution: number;
  frequency: string;
  wakala_fee: number;
  tabarru: number;
  risk_payload?: Record<string, unknown> | null;
  created_at: string;
};

type DbClaim = {
  id: string;
  claim_number: string;
  policy_id: string;
  participant_id: string;
  status: string;
  incident_date: string;
  reported_at: string;
  description: string | null;
  incident_location: string | null;
  claimed_amount: number | null;
  approved_amount: number | null;
  fraud_score: number | null;
  sla_due_at: string | null;
};

type DbPayment = {
  id: string;
  policy_id?: string | null;
  participant_id?: string | null;
  reference: string;
  method: string;
  status: string;
  amount: number;
  paid_at: string | null;
  receipt_number: string | null;
};

type DbJournal = {
  id: string;
  entry_date: string;
  reference: string | null;
  memo: string | null;
  debit?: number | null;
  credit?: number | null;
};

type DbParticipant = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  national_id: string | null;
  date_of_birth: string | null;
  county: string | null;
  occupation: string | null;
  kyc_status?: string | null;
  source_channel?: string | null;
  risk_score?: number | null;
  lifetime_value?: number | null;
};

export function mapProduct(row: DbProduct): Product {
  const config = (row.config ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    slug: row.slug,
    code: row.code,
    name: row.name,
    line: row.line as ProductLine,
    summary: String(config.summary ?? row.description ?? ""),
    description: row.description ?? "",
    model: row.takaful_model as TakafulModel,
    frequencies: (row.contribution_frequencies ?? ["monthly"]) as Frequency[],
    minContribution: Number(row.min_contribution ?? 0),
    maxSumCovered: Number(row.max_sum_covered ?? 0),
    waitingDays: row.waiting_period_days,
    wakalaRate: Number(row.wakala_fee_rate ?? 0.15),
    isMicro: row.is_micro,
    shariahApproved: row.shariah_approved,
    covers: (config.covers as Product["covers"]) ?? [],
    baseRate: Number(config.base_rate ?? 0),
    ratingBasis: (config.rating_basis as Product["ratingBasis"]) ?? "sum_covered",
  };
}

export function mapQuote(
  row: DbQuote,
  names?: { participantName?: string; productName?: string },
): Quote {
  return {
    id: row.id,
    number: row.quote_number,
    participantId: row.participant_id ?? "",
    participantName: names?.participantName ?? "Participant",
    productId: row.product_id,
    productName: names?.productName ?? "Product",
    agentId: row.agent_id ?? undefined,
    channel: row.channel as Channel,
    status: row.status as QuoteStatus,
    sumCovered: Number(row.sum_covered),
    frequency: row.frequency as Frequency,
    base: Number(row.base_contribution),
    wakala: Number(row.wakala_fee),
    tabarru: Number(row.tabarru),
    taxes: Number(row.taxes),
    levies: Number(row.levies),
    total: Number(row.total_contribution),
    monthly: Number(row.monthly_equivalent ?? 0),
    uwDecision: (row.uw_decision as UwDecision) ?? "auto_accept",
    uwNotes: row.uw_notes ?? "",
    risk: row.risk_payload ?? {},
    createdAt: row.created_at,
    validUntil: row.valid_until ?? "",
  };
}

export function mapPolicy(
  row: DbPolicy,
  names?: { participantName?: string; productName?: string; agentName?: string; branch?: string },
): Policy {
  const pas = (row.risk_payload ?? {}) as {
    history?: PolicyEndorsement[];
    pendingEndorsement?: Policy["pendingEndorsement"];
    instalmentPlan?: Policy["instalmentPlan"];
  };
  return {
    id: row.id,
    number: row.policy_number,
    quoteId: row.quote_id ?? undefined,
    participantId: row.participant_id,
    participantName: names?.participantName ?? "Participant",
    productId: row.product_id,
    productName: names?.productName ?? "Product",
    agentId: row.agent_id ?? undefined,
    agentName: names?.agentName,
    branch: names?.branch ?? "Head office",
    status: row.status as PolicyStatus,
    channel: row.channel as Channel,
    inception: row.inception_date,
    expiry: row.expiry_date,
    sumCovered: Number(row.sum_covered),
    contribution: Number(row.contribution),
    frequency: row.frequency as Frequency,
    wakala: Number(row.wakala_fee),
    tabarru: Number(row.tabarru),
    createdAt: row.created_at,
    history: pas.history,
    pendingEndorsement: pas.pendingEndorsement ?? undefined,
    instalmentPlan: pas.instalmentPlan ?? undefined,
  };
}

export function mapClaim(
  row: DbClaim,
  names?: { participantName?: string; policyNumber?: string },
): Claim {
  return {
    id: row.id,
    number: row.claim_number,
    policyId: row.policy_id,
    policyNumber: names?.policyNumber ?? "",
    participantId: row.participant_id,
    participantName: names?.participantName ?? "Participant",
    status: row.status as ClaimStatus,
    incidentDate: row.incident_date,
    reportedAt: row.reported_at,
    description: row.description ?? "",
    location: row.incident_location ?? "",
    claimed: Number(row.claimed_amount ?? 0),
    approved: row.approved_amount != null ? Number(row.approved_amount) : undefined,
    fraudScore: Number(row.fraud_score ?? 0),
    assessor: undefined,
    slaDue: row.sla_due_at ?? "",
  };
}

export function mapPayment(
  row: DbPayment,
  names?: { participantName?: string; policyNumber?: string },
): Payment {
  return {
    id: row.id,
    reference: row.reference,
    policyId: row.policy_id ?? undefined,
    policyNumber: names?.policyNumber,
    participantId: row.participant_id ?? undefined,
    participantName: names?.participantName ?? "Participant",
    method: row.method as PaymentMethod,
    status: row.status as PaymentStatus,
    amount: Number(row.amount),
    paidAt: row.paid_at ?? undefined,
    receipt: row.receipt_number ?? undefined,
  };
}

export function mapJournal(row: DbJournal): JournalEntry {
  return {
    id: row.id,
    date: row.entry_date,
    reference: row.reference ?? "",
    memo: row.memo ?? "",
    debit: Number(row.debit ?? 0),
    credit: Number(row.credit ?? 0),
  };
}

export function mapParticipant(row: DbParticipant): Participant {
  return {
    id: row.id,
    name: row.full_name,
    phone: row.phone ?? "",
    email: row.email ?? "",
    nationalId: row.national_id ?? "",
    dob: row.date_of_birth ?? "",
    county: row.county ?? "",
    occupation: row.occupation ?? "",
    kyc: (row.kyc_status as Participant["kyc"]) ?? "pending",
    channel: (row.source_channel as Participant["channel"]) ?? "web",
    riskScore: Number(row.risk_score ?? 0),
    clv: Number(row.lifetime_value ?? 0),
  };
}

export function policyRiskPayload(policy: Partial<Policy>) {
  return {
    history: policy.history ?? [],
    pendingEndorsement: policy.pendingEndorsement ?? null,
    instalmentPlan: policy.instalmentPlan ?? null,
  };
}
