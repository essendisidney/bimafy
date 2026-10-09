import { products as seedProducts, seedClaims, seedPolicies } from "@/lib/seed";
import { priceQuote, quoteStatusFromUw } from "@/lib/engines/quote";
import type { Claim, Frequency, Policy, Quote } from "@/lib/types";

/** In-memory partner API book (server process). Seeded from demo catalogue. */
type V1Book = {
  quotes: Quote[];
  policies: Policy[];
  claims: Claim[];
};

const globalStore = globalThis as unknown as { __bimafyV1?: V1Book };

function book(): V1Book {
  if (!globalStore.__bimafyV1) {
    globalStore.__bimafyV1 = {
      quotes: [],
      policies: [...seedPolicies],
      claims: [...seedClaims],
    };
  }
  return globalStore.__bimafyV1;
}

export function v1ListProducts() {
  return seedProducts.map((p) => ({
    id: p.id,
    slug: p.slug,
    code: p.code,
    name: p.name,
    line: p.line,
    summary: p.summary,
    frequencies: p.frequencies,
    minContribution: p.minContribution,
    maxSumCovered: p.maxSumCovered,
    isMicro: p.isMicro,
    shariahApproved: p.shariahApproved,
  }));
}

export function v1CreateQuote(input: {
  productId?: string;
  productSlug?: string;
  participantName: string;
  participantId?: string;
  sumCovered: number;
  frequency: Frequency;
  risk?: Record<string, string | number | boolean>;
  partnerId: string;
}) {
  const product =
    seedProducts.find((p) => p.id === input.productId) ??
    seedProducts.find((p) => p.slug === input.productSlug);
  if (!product) throw new Error("Product not found");

  const priced = priceQuote({
    product,
    participantId: input.participantId ?? `ext-${input.partnerId}`,
    participantName: input.participantName,
    sumCovered: input.sumCovered,
    frequency: input.frequency,
    channel: "api",
    risk: input.risk ?? {},
  });

  const now = new Date();
  const quote: Quote = {
    id: crypto.randomUUID(),
    number: `Q-API-${Math.floor(Math.random() * 90000 + 10000)}`,
    participantId: priced.participantId,
    participantName: priced.participantName,
    productId: priced.productId,
    productName: priced.productName,
    agentId: priced.agentId,
    channel: priced.channel,
    status: quoteStatusFromUw(priced.uwDecision),
    sumCovered: priced.sumCovered,
    frequency: priced.frequency,
    base: priced.base,
    wakala: priced.wakala,
    tabarru: priced.tabarru,
    taxes: priced.taxes,
    levies: priced.levies,
    total: priced.total,
    monthly: priced.monthly,
    uwDecision: priced.uwDecision,
    uwNotes: priced.uwNotes,
    risk: priced.risk,
    createdAt: now.toISOString(),
    validUntil: new Date(now.getTime() + 7 * 86400000).toISOString(),
  };

  book().quotes.unshift(quote);
  return quote;
}

export function v1GetQuote(idOrNumber: string) {
  return book().quotes.find((q) => q.id === idOrNumber || q.number === idOrNumber) ?? null;
}

export function v1BindPolicy(quoteIdOrNumber: string, partnerId: string) {
  const quote = v1GetQuote(quoteIdOrNumber);
  if (!quote) throw new Error("Quote not found");
  if (quote.status === "declined" || quote.uwDecision === "reject") {
    throw new Error("Cannot bind a declined quote");
  }
  if (quote.status === "referred" || quote.uwDecision === "refer") {
    throw new Error("Quote referred — await underwriter decision");
  }

  const start = new Date();
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);

  const policy: Policy = {
    id: crypto.randomUUID(),
    number: `POL-API-${Math.floor(Math.random() * 90000 + 10000)}`,
    productId: quote.productId,
    productName: quote.productName,
    participantId: quote.participantId,
    participantName: quote.participantName,
    status: "active",
    sumCovered: quote.sumCovered,
    frequency: quote.frequency,
    contribution: quote.total,
    wakala: quote.wakala,
    tabarru: quote.tabarru,
    inception: start.toISOString().slice(0, 10),
    expiry: end.toISOString().slice(0, 10),
    branch: "API Distribution",
    channel: "api",
    agentId: partnerId,
    agentName: partnerId,
    createdAt: start.toISOString(),
  };

  quote.status = "converted";
  book().policies.unshift(policy);
  return policy;
}

export function v1GetPolicy(number: string) {
  return book().policies.find((p) => p.number === number || p.id === number) ?? null;
}

export function v1CreateClaim(input: {
  policyNumber: string;
  description: string;
  claimed: number;
  incidentDate?: string;
  location?: string;
}) {
  const policy = v1GetPolicy(input.policyNumber);
  if (!policy) throw new Error("Policy not found");

  const reportedAt = new Date();
  const slaDue = new Date(reportedAt.getTime() + 3 * 86400000);

  const claim: Claim = {
    id: crypto.randomUUID(),
    number: `CLM-API-${Math.floor(Math.random() * 90000 + 10000)}`,
    policyId: policy.id,
    policyNumber: policy.number,
    participantId: policy.participantId,
    participantName: policy.participantName,
    status: "under_review",
    incidentDate: input.incidentDate ?? reportedAt.toISOString().slice(0, 10),
    reportedAt: reportedAt.toISOString(),
    description: input.description,
    claimed: input.claimed,
    fraudScore: 18,
    location: input.location ?? "",
    slaDue: slaDue.toISOString(),
  };

  book().claims.unshift(claim);
  return claim;
}

export function v1GetClaim(number: string) {
  return book().claims.find((c) => c.number === number || c.id === number) ?? null;
}
