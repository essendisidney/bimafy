export type BimafyModule = {
  slug: string;
  code: string;
  name: string;
  tagline: string;
  description: string;
  href: string;
  capabilities: string[];
};

export const BIMAFY_TAGLINE = "The End-to-End Insurance Operating Platform";
export const BIMAFY_IDEA = "One platform. Every insurance workflow. One source of truth.";

export const modules: BimafyModule[] = [
  {
    slug: "core",
    code: "Core",
    name: "Bimafy Core",
    tagline: "Policy administration",
    description: "Issue, endorse, renew, suspend, and certificate every policy from a single PAS ledger.",
    href: "/app/policies",
    capabilities: ["Quotes to bind", "Endorsements", "Certificates", "Product configuration"],
  },
  {
    slug: "risk",
    code: "Risk",
    name: "Bimafy Risk",
    tagline: "Underwriting & risk scoring",
    description: "Straight-through underwriting with explainable loads, referrals, and credit/identity hooks.",
    href: "/app/underwriting",
    capabilities: ["STP rules", "Referral queue", "CRB / IPRS / NTSA", "Risk scoring"],
  },
  {
    slug: "claims",
    code: "Claims",
    name: "Bimafy Claims",
    tagline: "Digital claims management",
    description: "FNOL to payout with photos, OCR, assessor assignment, approvals, and SLA clocks.",
    href: "/app/claims",
    capabilities: ["FNOL", "Assessor workflow", "SLA", "Payouts"],
  },
  {
    slug: "pay",
    code: "Pay",
    name: "Bimafy Pay",
    tagline: "Premiums, collections & reconciliation",
    description: "M-Pesa STK, cards, and ledger reconciliation against every policy installment.",
    href: "/app/payments",
    capabilities: ["STK push", "Installments", "Reconciliation", "GL postings"],
  },
  {
    slug: "fraud",
    code: "Fraud",
    name: "Bimafy Fraud",
    tagline: "Fraud & anomaly detection",
    description: "Early-claim, duplicate, frequency, and amount-outlier signals before money moves.",
    href: "/app/fraud",
    capabilities: ["Claim scoring", "Duplicate detection", "Anomaly queues", "Explainable flags"],
  },
  {
    slug: "connect",
    code: "Connect",
    name: "Bimafy Connect",
    tagline: "APIs & embedded insurance",
    description: "Quote, bind, and claim from banks, SACCOs, ride-hailing, and retail checkouts.",
    href: "/app/integrations",
    capabilities: ["Partner API /v1", "Webhooks", "WhatsApp", "USSD"],
  },
  {
    slug: "agent",
    code: "Agent",
    name: "Bimafy Agent",
    tagline: "Agency / broker ecosystem",
    description: "Leads, commissions, offline field enrolment, and broker bordereaux in one network.",
    href: "/app/agent",
    capabilities: ["Agency desk", "Broker desk", "Commissions", "Offline sync"],
  },
  {
    slug: "ai",
    code: "AI",
    name: "Bimafy AI",
    tagline: "Intelligence, automation & decisioning",
    description: "Models assist underwriting, claims triage, care, and fraud — never silently bind the book.",
    href: "/app/ai",
    capabilities: ["Triage", "Care bot", "Document OCR", "Decisioning"],
  },
  {
    slug: "data",
    code: "Data",
    name: "Bimafy Data",
    tagline: "Analytics & regulatory reporting",
    description: "GWP, loss ratio, TAT, IRA-ready extracts, and an audit trail across the operating book.",
    href: "/app/analytics",
    capabilities: ["Executive KPIs", "IRA reporting", "Audit log", "Surplus / reinsurance"],
  },
  {
    slug: "customer",
    code: "Customer",
    name: "Bimafy Customer",
    tagline: "Customer self-service",
    description: "Buy, pay, claim, download certificates, and update KYC without calling the office.",
    href: "/app/customer",
    capabilities: ["Self-service", "KYC", "Certificates", "Care tickets"],
  },
];
