import { createClient } from "@supabase/supabase-js";
import { agents as seedAgents } from "./seed.ts";
import { getSupabaseEnv, isSupabaseConfigured } from "./supabase/config.ts";

/** A public agent card (public.public_agents / public_agent, migration 00017). */
export type PublicAgent = {
  slug: string;
  name: string;
  bio: string | null;
  languages: string[];
  counties: string[];
  branch: string | null;
  licensed: boolean;
  since: string;
  rating: number | null;
  reviews: number;
  recent?: { name: string | null; rating: number; comment: string | null; at: string }[];
};

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Demo deployments (no database) list the sample agents, clearly without any reviews. */
const DEMO: PublicAgent[] = seedAgents.map((a) => ({
  slug: slugify(a.name),
  name: a.name,
  bio: `Sample profile for the demo. ${a.name.split(" ")[0]} helps families and businesses in ${a.branch} choose cover and pay by M-Pesa.`,
  languages: ["English", "Kiswahili"],
  counties: [a.branch === "Nairobi CBD" ? "Nairobi" : a.branch],
  branch: a.branch,
  licensed: Boolean(a.license),
  since: "2025-01-15T00:00:00Z",
  rating: null,
  reviews: 0,
  recent: [],
}));

function db() {
  const { url, key } = getSupabaseEnv();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function listPublicAgents(): Promise<PublicAgent[]> {
  if (!isSupabaseConfigured()) return DEMO;
  const { data, error } = await db().rpc("public_agents");
  if (error) throw new Error(error.message);
  return (data as PublicAgent[]) ?? [];
}

export async function getPublicAgent(slug: string): Promise<PublicAgent | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  if (!isSupabaseConfigured()) return DEMO.find((a) => a.slug === slug) ?? null;
  const { data, error } = await db().rpc("public_agent", { p_slug: slug });
  if (error) throw new Error(error.message);
  return (data as PublicAgent | null) ?? null;
}

export const firstName = (name: string) => name.split(" ")[0];

/** "4.8 ★ (12 reviews)" or "New on Bimafy". */
export function ratingLabel(a: Pick<PublicAgent, "rating" | "reviews">) {
  if (!a.reviews || a.rating == null) return "New on Bimafy";
  return `${Number(a.rating).toFixed(1)} (${a.reviews} review${a.reviews === 1 ? "" : "s"})`;
}
