/**
 * Pure helpers for onboarding agents (no imports, so they unit-test in Node).
 */

export type NewAgentInput = { fullName: string; email: string; phone: string; branchCode: string; salesTarget: string };

/** First problem with the form, or null when it can be sent. */
export function newAgentProblem(input: NewAgentInput): string | null {
  if (input.fullName.trim().split(/\s+/).filter(Boolean).length < 2) return "Enter the agent's first and last name.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) return "Enter a valid email address.";
  const digits = input.phone.replace(/\D/g, "");
  if (digits && (digits.length < 9 || digits.length > 12)) return "Enter a valid phone number, e.g. 0712 345 678.";
  if (input.salesTarget && !/^\d+$/.test(input.salesTarget.replace(/[,\s]/g, ""))) return "Sales target must be a number.";
  return null;
}

/** The WhatsApp/SMS message an admin sends a new agent with their login. */
export function inviteMessage(opts: { name: string; email: string; password: string; url: string; code?: string; reset?: boolean }) {
  const first = opts.name.trim().split(/\s+/)[0] || "there";
  const lead = opts.reset
    ? `Hi ${first}, here is a new one-time password for Bimafy.`
    : `Hi ${first}, welcome to Bimafy!${opts.code ? ` Your agent code is ${opts.code}.` : ""}`;
  return [
    lead,
    `Sign in: ${opts.url}`,
    `Email: ${opts.email}`,
    `One-time password: ${opts.password}`,
    "You'll choose your own password when you sign in. Install the app from the menu so it works offline.",
    "",
    "Karibu Bimafy! Ingia kwa barua pepe na nenosiri hili la mara moja, kisha uchague nenosiri lako.",
  ].join("\n");
}
