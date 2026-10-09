export type UserRole =
  | "participant"
  | "agent"
  | "broker"
  | "underwriter"
  | "claims_officer"
  | "claims_assessor"
  | "finance"
  | "compliance"
  | "shariah_officer"
  | "admin"
  | "call_center"
  | "branch_manager";

export type ProductLine =
  | "motor"
  | "medical"
  | "family_takaful"
  | "funeral"
  | "agriculture"
  | "livestock"
  | "travel"
  | "gadget"
  | "micro"
  | "asset";

export type TakafulModel = "wakala" | "mudarabah" | "hybrid";
export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "annually" | "single";
export type Channel = "mobile" | "web" | "ussd" | "whatsapp" | "agent" | "broker" | "api" | "embedded";
export type QuoteStatus = "draft" | "priced" | "referred" | "declined" | "accepted" | "expired" | "converted";
export type UwDecision = "auto_accept" | "refer" | "reject" | "load";
export type PolicyStatus =
  | "draft"
  | "pending_payment"
  | "pending_underwriting"
  | "active"
  | "suspended"
  | "cancelled"
  | "expired"
  | "lapsed"
  | "reinstated";
export type ClaimStatus =
  | "reported"
  | "documents_pending"
  | "under_review"
  | "fraud_check"
  | "assigned"
  | "assessing"
  | "estimated"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "paid"
  | "closed";
export type PaymentStatus = "pending" | "processing" | "completed" | "failed" | "refunded" | "reconciled";
export type PaymentMethod =
  | "mpesa_stk"
  | "mpesa_paybill"
  | "mpesa_till"
  | "airtel_money"
  | "bank_transfer"
  | "card"
  | "direct_debit"
  | "flutterwave"
  | "paystack"
  | "cellulant"
  | "stripe";
export type KycStatus = "pending" | "in_review" | "verified" | "rejected" | "expired";

export type AmlResult = "clear" | "pending" | "hit" | "escalated";

export type AmlScreening = {
  id: string;
  participantId: string;
  participantName: string;
  type: "sanctions_peps" | "aml_onboarding" | "device_identity" | "adverse_media" | "iprs_refresh";
  result: AmlResult;
  notes?: string;
  screenedAt: string;
  screenedBy?: string;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  actor: string;
  subject: string;
  detail: string;
  createdAt: string;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  branch: string;
  participantId?: string;
  agentId?: string;
  brokerId?: string;
};

export type Product = {
  id: string;
  slug: string;
  code: string;
  name: string;
  line: ProductLine;
  summary: string;
  description: string;
  model: TakafulModel;
  frequencies: Frequency[];
  minContribution: number;
  maxSumCovered: number;
  waitingDays: number;
  wakalaRate: number;
  isMicro: boolean;
  shariahApproved: boolean;
  covers: { code: string; name: string; optional?: boolean }[];
  baseRate: number;
  ratingBasis: "sum_covered" | "flat" | "age_band";
};

export type Participant = {
  id: string;
  name: string;
  phone: string;
  email: string;
  nationalId: string;
  dob: string;
  county: string;
  occupation: string;
  kyc: KycStatus;
  channel: Channel;
  riskScore: number;
  clv: number;
};

export type Agent = {
  id: string;
  /** Supabase agents.id when this demo agent is seeded in the database. */
  dbId?: string;
  code: string;
  name: string;
  phone: string;
  branch: string;
  license: string;
  wallet: number;
  ytdGwp: number;
  target: number;
};

export type Broker = {
  id: string;
  /** Supabase brokers.id when this demo broker is seeded in the database. */
  dbId?: string;
  code: string;
  name: string;
  license: string;
  clients: number;
  commissionRate: number;
  ytdGwp: number;
  wallet: number;
};

export type Quote = {
  id: string;
  number: string;
  participantId: string;
  participantName: string;
  productId: string;
  productName: string;
  agentId?: string;
  brokerId?: string;
  channel: Channel;
  status: QuoteStatus;
  sumCovered: number;
  frequency: Frequency;
  base: number;
  wakala: number;
  tabarru: number;
  taxes: number;
  levies: number;
  total: number;
  monthly: number;
  uwDecision: UwDecision;
  uwNotes: string;
  risk: Record<string, string | number | boolean>;
  createdAt: string;
  validUntil: string;
};

export type PolicyEndorsement = {
  id: string;
  at: string;
  action: string;
  summary: string;
  beforeSumCovered?: number;
  afterSumCovered?: number;
  beforeContribution?: number;
  afterContribution?: number;
};

export type Policy = {
  id: string;
  number: string;
  quoteId?: string;
  participantId: string;
  participantName: string;
  productId: string;
  productName: string;
  agentId?: string;
  agentName?: string;
  brokerId?: string;
  branch: string;
  status: PolicyStatus;
  channel: Channel;
  inception: string;
  expiry: string;
  sumCovered: number;
  contribution: number;
  frequency: Frequency;
  wakala: number;
  tabarru: number;
  createdAt: string;
  history?: PolicyEndorsement[];
  pendingEndorsement?: {
    sumCovered: number;
    contribution: number;
    wakala: number;
    tabarru: number;
    requestedAt: string;
  };
};

export type Claim = {
  id: string;
  number: string;
  policyId: string;
  policyNumber: string;
  participantId: string;
  participantName: string;
  status: ClaimStatus;
  incidentDate: string;
  reportedAt: string;
  description: string;
  location: string;
  claimed: number;
  approved?: number;
  fraudScore: number;
  assessor?: string;
  slaDue: string;
};

export type Payment = {
  id: string;
  reference: string;
  policyId?: string;
  policyNumber?: string;
  participantId?: string;
  participantName: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  paidAt?: string;
  receipt?: string;
};

export type LeadStatus = "new" | "contacted" | "quoted" | "won" | "lost";
export type LeadSource = "referral" | "walk_in" | "whatsapp" | "ussd" | "campaign" | "bulk_import" | "partner" | "renewal";

export type LeadActivity = {
  id: string;
  at: string;
  kind: "call" | "whatsapp" | "sms" | "meeting" | "note" | "status";
  summary: string;
};

export type Lead = {
  id: string;
  name: string;
  phone: string;
  productLine: ProductLine;
  status: LeadStatus;
  agentId?: string;
  brokerId?: string;
  notes: string;
  /** Estimated annual contribution if won (KES). */
  value?: number;
  source?: LeadSource;
  createdAt?: string;
  /** ISO date (YYYY-MM-DD) of the next promised follow-up. */
  nextActionAt?: string;
  lostReason?: string;
  activities?: LeadActivity[];
};

export type Ticket = {
  id: string;
  subject: string;
  channel: "call" | "email" | "whatsapp" | "sms" | "app";
  status: "open" | "pending" | "resolved";
  priority: "low" | "normal" | "high";
  participantName: string;
  participantId?: string;
  policyId?: string;
  claimId?: string;
  notes?: string;
  assignee?: string;
  createdAt: string;
  updatedAt?: string;
};

export type NotificationItem = {
  id: string;
  channel: "sms" | "email" | "whatsapp" | "push";
  title: string;
  body: string;
  status: "queued" | "sent" | "failed" | "read";
  createdAt: string;
  href?: string;
};

export type WebhookDelivery = {
  id: string;
  event: string;
  url: string;
  status: "queued" | "delivered" | "failed";
  payload: Record<string, unknown>;
  createdAt: string;
};

export type DocumentItem = {
  id: string;
  owner: string;
  type: string;
  name: string;
  createdAt: string;
  policyId?: string;
  claimId?: string;
  participantId?: string;
  mime?: string;
  /** Inline demo content for download (text/html or plain). */
  body?: string;
  ocrText?: string;
};

export type Treaty = {
  id: string;
  name: string;
  type: "facultative" | "treaty";
  reinsurer: string;
  cessionRate: number;
  from: string;
  to: string;
  cededYtd: number;
  recoveriesYtd: number;
  status: "active" | "expired" | "draft";
  /** Product lines this treaty can accept */
  lines: string[];
};

export type ReinsuranceCession = {
  id: string;
  treatyId: string;
  treatyName: string;
  policyId: string;
  policyNumber: string;
  participantName: string;
  productLine: string;
  grossContribution: number;
  cededContribution: number;
  retention: number;
  createdAt: string;
};

export type ReinsuranceRecovery = {
  id: string;
  treatyId: string;
  treatyName: string;
  claimId: string;
  claimNumber: string;
  amount: number;
  status: "submitted" | "accepted" | "paid";
  createdAt: string;
};

export type JournalEntry = {
  id: string;
  date: string;
  reference: string;
  memo: string;
  debit: number;
  credit: number;
};

export type SurplusStatus = "draft" | "pending_shariah" | "approved" | "rejected" | "distributed";

export type SurplusShare = {
  participantId: string;
  participantName: string;
  tabarruBase: number;
  shareAmount: number;
  status: "accrued" | "payable" | "paid";
};

export type SurplusPeriod = {
  id: string;
  code: string;
  label: string;
  year: number;
  status: SurplusStatus;
  tabarruPool: number;
  claimsCost: number;
  expenses: number;
  investmentIncome: number;
  netSurplus: number;
  participantPool: number;
  contingencyReserve: number;
  charityPool: number;
  participantShareRate: number;
  contingencyRate: number;
  charityRate: number;
  shares: SurplusShare[];
  shariahNotes: string;
  declaredAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  createdAt: string;
};

export type PlatformState = {
  quotes: Quote[];
  policies: Policy[];
  claims: Claim[];
  payments: Payment[];
  leads: Lead[];
  tickets: Ticket[];
  notifications: NotificationItem[];
  surplusPeriods: SurplusPeriod[];
  kycOverrides: Record<string, KycStatus>;
  screenings: AmlScreening[];
  auditLogs: AuditLogEntry[];
  documents: DocumentItem[];
  treaties: Treaty[];
  cessions: ReinsuranceCession[];
  recoveries: ReinsuranceRecovery[];
  journals: JournalEntry[];
  /** Live commission / GWP deltas keyed by agent or broker id (a-* / b-*). */
  balanceDeltas: Record<string, { wallet: number; gwp: number }>;
  webhooks: WebhookDelivery[];
};
