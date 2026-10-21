import { agents, participants, seedClaims, seedPayments, seedPolicies } from "./seed.ts";
import type { InstalmentPlan, Policy } from "./types";

/** What a signed-in customer sees (public.customer_portal, migration 00018). */
export type PortalPolicy = {
  id: string;
  number: string;
  status: Policy["status"];
  product_name: string;
  line: string;
  inception: string;
  expiry: string;
  sum_covered: number;
  contribution: number;
  frequency: Policy["frequency"];
  wakala: number;
  tabarru: number;
  participant_name: string;
  instalment_plan: InstalmentPlan | null;
  can_pay: boolean;
  agent: { name: string; phone: string | null; slug: string | null } | null;
};
export type PortalData = {
  first_name: string;
  full_name: string;
  policies: PortalPolicy[];
  payments: { policy_number: string; amount: number; status: string; paid_at: string | null; receipt: string | null; method: string }[];
  claims: {
    number: string;
    policy_number: string;
    status: string;
    incident_date: string;
    reported_at: string;
    claimed: number | null;
    approved: number | null;
    description: string | null;
    /** Photos the customer has added (migration 00019). */
    photos?: number;
    /** Steps staff recorded, oldest first. */
    steps?: { status: string; at: string }[];
  }[];
};

export const DEMO_PORTAL_TOKEN = "demo";
/** In demo mode (no database) any number signs in with this code. */
export const DEMO_CODE = "123456";

/** The demo customer (Amina, p-1) built from the seed so the portal can be shown end to end. */
export function demoPortal(): PortalData {
  const me = participants.find((p) => p.id === "p-1")!;
  const mine = seedPolicies.filter((p) => p.participantId === me.id);
  const numbers = new Set(mine.map((p) => p.number));
  return {
    first_name: me.name.split(" ")[0],
    full_name: me.name,
    policies: mine.map((p) => {
      const agent = agents.find((a) => a.id === p.agentId);
      return {
        id: p.id,
        number: p.number,
        status: p.status,
        product_name: p.productName,
        line: "",
        inception: p.inception,
        expiry: p.expiry,
        sum_covered: p.sumCovered,
        contribution: p.contribution,
        frequency: p.frequency,
        wakala: p.wakala,
        tabarru: p.tabarru,
        participant_name: p.participantName,
        instalment_plan: p.instalmentPlan ?? null,
        can_pay: true,
        agent: agent ? { name: agent.name, phone: agent.phone, slug: agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") } : null,
      };
    }),
    payments: seedPayments
      .filter((p) => p.policyNumber && numbers.has(p.policyNumber))
      .map((p) => ({ policy_number: p.policyNumber!, amount: p.amount, status: p.status, paid_at: p.paidAt ?? null, receipt: p.receipt ?? null, method: p.method })),
    claims: seedClaims
      .filter((c) => numbers.has(c.policyNumber))
      .map((c) => ({
        number: c.number,
        policy_number: c.policyNumber,
        status: c.status,
        incident_date: c.incidentDate,
        reported_at: c.reportedAt,
        claimed: c.claimed,
        approved: c.approved ?? null,
        description: c.description,
        photos: 0,
        steps: [],
      })),
  };
}

/** Rebuild the app's Policy shape so the same certificate generator works for customers. */
export function portalPolicyToPolicy(p: PortalPolicy): Policy {
  return {
    id: p.id,
    number: p.number,
    participantId: "",
    participantName: p.participant_name,
    productId: "",
    productName: p.product_name,
    agentName: p.agent?.name,
    branch: "",
    status: p.status,
    channel: "web",
    inception: p.inception,
    expiry: p.expiry,
    sumCovered: Number(p.sum_covered),
    contribution: Number(p.contribution),
    frequency: p.frequency,
    wakala: Number(p.wakala),
    tabarru: Number(p.tabarru),
    createdAt: p.inception,
  };
}

/** The sign-in SMS. Plain GSM text, one SMS part. */
export const codeMessage = (code: string) =>
  `Your Bimafy code is ${code}. It expires in 10 minutes. Never share it - Bimafy staff will never ask for it.`;
