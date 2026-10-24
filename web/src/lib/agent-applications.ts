/**
 * Agents applying to join Bimafy (public.agent_apply / agent_application_decide,
 * migration 00022). Pure helpers, no imports, so they unit-test in Node.
 */

/** The product lines an applicant can say they sell (public.product_line). */
export const APPLY_LINES = [
  ["motor", "Motor"],
  ["medical", "Medical"],
  ["family_takaful", "Life / Family Takaful"],
  ["funeral", "Last expense"],
  ["agriculture", "Crops"],
  ["livestock", "Livestock"],
  ["travel", "Travel"],
  ["gadget", "Phones & gadgets"],
  ["asset", "Home & business"],
] as const;

export type ApplicationInput = {
  name: string;
  phone: string;
  email: string;
  county: string;
  licenseNumber: string;
  yearsExperience: string;
  lines: string[];
  message: string;
};

export type Application = {
  id: string;
  name: string;
  phone: string;
  email: string;
  county: string | null;
  license_number: string | null;
  years_experience: number | null;
  lines: string[];
  message: string | null;
  status: "pending" | "approved" | "declined";
  decline_reason: string | null;
  created_at: string;
  decided_at: string | null;
};

/** "0712345678", "+254 712 345 678" → "254712345678"; null if it isn't a Kenyan mobile. */
export function applicantPhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  const n = d.startsWith("254") ? d : d.startsWith("0") ? `254${d.slice(1)}` : d.length === 9 ? `254${d}` : d;
  return /^254[17]\d{8}$/.test(n) ? n : null;
}

/** First problem with the form, or null when it can be sent. Mirrors public.agent_apply. */
export function applicationProblem(input: ApplicationInput): string | null {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < 3 || name.length > 80 || !name.includes(" ")) return "Enter your first and last name.";
  if (!applicantPhone(input.phone)) return "Enter a Kenyan mobile number (07… or 01…).";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) return "Enter a valid email address — it becomes your login.";
  if (input.yearsExperience && !/^\d{1,2}$/.test(input.yearsExperience.trim())) return "Years of experience must be a number.";
  if (!input.lines.length) return "Pick at least one type of cover you sell.";
  return null;
}

const first = (name: string) => name.trim().split(/\s+/)[0] || "there";

/** SMS to the applicant when the application arrives (GSM-7, one part). */
export function applicationReceivedSms(name: string) {
  return `Hi ${first(name)}, thank you for applying to sell with Bimafy. We will check your details and text you within 2 working days.`;
}

/** SMS to the applicant when they're approved: their login, ready to use. */
export function applicationApprovedSms(opts: { name: string; email: string; password: string; code?: string; url: string }) {
  return [
    `Welcome to Bimafy, ${first(opts.name)}!${opts.code ? ` Agent code ${opts.code}.` : ""}`,
    `Sign in at ${opts.url}/login with ${opts.email} and one-time password ${opts.password} (you then choose your own).`,
    "Publish your profile to start getting customers.",
  ].join(" ");
}

export function applicationDeclinedSms(name: string, reason?: string | null) {
  const why = reason?.trim() ? ` Reason: ${reason.trim().replace(/[^\x20-\x7E]/g, "").slice(0, 120)}.` : "";
  return `Hi ${first(name)}, thank you for applying to Bimafy. We can't take your application forward right now.${why} You are welcome to apply again later.`;
}

export const lineLabel = (line: string) => APPLY_LINES.find(([v]) => v === line)?.[1] ?? line;
