import type { Frequency, Product, Quote, UwDecision } from "../types";
import { applyLevies, frequencyFactor, splitContribution, toMonthly } from "./takaful";
import { underwrite, type UwInput } from "./underwriting";

export type QuoteRequest = {
  product: Product;
  participantId: string;
  participantName: string;
  sumCovered: number;
  frequency: Frequency;
  channel: Quote["channel"];
  agentId?: string;
  brokerId?: string;
  risk: Record<string, string | number | boolean>;
};

export type PricedQuote = Omit<Quote, "id" | "number" | "createdAt" | "validUntil" | "status"> & {
  uwNotesList: string[];
};

export function priceQuote(req: QuoteRequest): PricedQuote {
  const uwInput: UwInput = {
    product: req.product,
    age: num(req.risk.age),
    vehicleAge: num(req.risk.vehicleAge),
    medicalCondition: String(req.risk.medicalCondition ?? ""),
    claimsLast3Years: num(req.risk.claimsLast3Years),
    sumCovered: req.sumCovered,
    creditScore: num(req.risk.creditScore),
  };
  const uw = underwrite(uwInput);

  let annual = 0;
  if (req.product.ratingBasis === "flat") {
    // Flat products are priced per their shortest instalment (e.g. KES 30/day for boda).
    annual = req.product.minContribution / frequencyFactor(req.product.frequencies[0] ?? "annually");
  } else if (req.product.ratingBasis === "age_band") {
    const age = num(req.risk.age) ?? 30;
    const band = age < 18 ? 0.8 : age < 35 ? 1 : age < 50 ? 1.25 : 1.6;
    annual = req.product.minContribution * band;
  } else {
    annual = req.sumCovered * req.product.baseRate;
  }

  if (uw.loadPercent) annual *= 1 + uw.loadPercent / 100;
  annual = Math.max(annual, req.product.minContribution);

  const periodContribution = round2(annual * frequencyFactor(req.frequency));
  const { wakala, tabarru } = splitContribution(periodContribution, req.product.wakalaRate);
  const { taxes, levies } = applyLevies(periodContribution);
  const total = round2(periodContribution + taxes + levies);

  return {
    participantId: req.participantId,
    participantName: req.participantName,
    productId: req.product.id,
    productName: req.product.name,
    agentId: req.agentId,
    brokerId: req.brokerId,
    channel: req.channel,
    sumCovered: req.sumCovered,
    frequency: req.frequency,
    base: periodContribution,
    wakala,
    tabarru,
    taxes,
    levies,
    total,
    monthly: toMonthly(annual + (annual * (levies + taxes)) / Math.max(periodContribution, 1)),
    uwDecision: uw.decision,
    uwNotes: uw.notes.join(" "),
    uwNotesList: uw.notes,
    risk: req.risk,
  };
}

export function quoteStatusFromUw(decision: UwDecision) {
  if (decision === "reject") return "declined" as const;
  if (decision === "refer") return "referred" as const;
  return "priced" as const;
}

function num(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return undefined;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
