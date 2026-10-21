import { priceQuote } from "./engines/quote.ts";
import type { Lang } from "./lang";
import { products } from "./seed.ts";
import type { Frequency } from "./types";

/**
 * The website's "what do you want covered?" options and how each is priced.
 * Shared by the landing-page card and the server, which re-prices every
 * request itself instead of trusting the number the browser shows.
 */

export type Ask = { kind: "sum" | "age"; def: number; min: number; max: number; step: number; label: Record<Lang, string> };
export type Need = { slug: string; label: Record<Lang, string>; ask?: Ask };

export const NEEDS: Need[] = [
  {
    slug: "motor-comprehensive",
    label: { en: "My car", sw: "Gari langu" },
    ask: { kind: "sum", def: 1_200_000, min: 300_000, max: 8_000_000, step: 50_000, label: { en: "Car value", sw: "Thamani ya gari" } },
  },
  { slug: "boda-micro", label: { en: "My boda", sw: "Boda yangu" } },
  {
    slug: "hospital-cash",
    label: { en: "Hospital", sw: "Hospitali" },
    ask: { kind: "age", def: 32, min: 18, max: 65, step: 1, label: { en: "Your age", sw: "Umri wako" } },
  },
  {
    slug: "family-takaful",
    label: { en: "My family", sw: "Familia yangu" },
    ask: { kind: "sum", def: 1_000_000, min: 200_000, max: 5_000_000, step: 100_000, label: { en: "Cover amount", sw: "Kiasi cha bima" } },
  },
  {
    slug: "gadget",
    label: { en: "My phone", sw: "Simu yangu" },
    ask: { kind: "sum", def: 45_000, min: 10_000, max: 250_000, step: 5_000, label: { en: "Phone value", sw: "Thamani ya simu" } },
  },
  {
    slug: "janaaza",
    label: { en: "Funeral", sw: "Mazishi" },
    ask: { kind: "sum", def: 100_000, min: 20_000, max: 200_000, step: 10_000, label: { en: "Cover amount", sw: "Kiasi cha bima" } },
  },
];

export const PER: Record<Lang, Record<Frequency, string>> = {
  en: { daily: "day", weekly: "week", monthly: "month", quarterly: "quarter", annually: "year", single: "trip" },
  sw: { daily: "siku", weekly: "wiki", monthly: "mwezi", quarterly: "robo mwaka", annually: "mwaka", single: "safari" },
};

export const DAYS_PER: Record<Frequency, number> = { daily: 1, weekly: 7, monthly: 365 / 12, quarterly: 365 / 4, annually: 365, single: 0 };

const PERIODS_PER_YEAR: Record<Frequency, number> = { daily: 365, weekly: 52, monthly: 12, quarterly: 4, annually: 1, single: 1 };

/** Clamp to the slider's range and step, so a hand-made request can't price outside it. */
export function clampInput(need: Need, value: unknown) {
  if (!need.ask) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return need.ask.def;
  const stepped = Math.round((n - need.ask.min) / need.ask.step) * need.ask.step + need.ask.min;
  return Math.min(need.ask.max, Math.max(need.ask.min, stepped));
}

export function priceNeed(slug: string, value?: unknown) {
  const need = NEEDS.find((n) => n.slug === slug);
  if (!need) return null;
  const product = products.find((p) => p.slug === need.slug) ?? products[0];
  const input = clampInput(need, value ?? need.ask?.def);
  const frequency = product.frequencies[0];
  const quote = priceQuote({
    product,
    participantId: "guest",
    participantName: "Guest",
    sumCovered: need.ask?.kind === "sum" ? input : product.maxSumCovered,
    frequency,
    channel: "web",
    risk: need.ask?.kind === "age" ? { age: input } : { age: 32, vehicleAge: 5 },
  });
  const total = Math.max(1, Math.round(quote.total));
  return { need, product, input, frequency, quote, total, annual: total * PERIODS_PER_YEAR[frequency] };
}
