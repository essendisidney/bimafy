/**
 * The SMS a customer gets when staff move their claim forward. Only steps a
 * customer cares about send a text; plain GSM characters keep each one cheap.
 */

export type ClaimStepInfo = {
  number: string;
  first_name: string;
  phone: string | null;
  policy_number: string;
  approved: number | string | null;
  claimed: number | string | null;
  agent_name: string | null;
};

export const NOTIFY_STEPS = ["documents_pending", "assigned", "approved", "paid", "rejected"] as const;

const kes = (n: number | string | null) => (n == null ? null : `KES ${Math.round(Number(n)).toLocaleString("en-KE")}`);

export function claimStepMessage(status: string, c: ClaimStepInfo, site: string) {
  const first = c.first_name || "there";
  const agent = c.agent_name?.split(" ")[0];
  switch (status) {
    case "documents_pending":
      return `Hi ${first}, for claim ${c.number} we need photos or documents. Add them on your phone at ${site}/my - Bimafy`;
    case "assigned":
      return `Hi ${first}, an assessor has been assigned to claim ${c.number} and will contact you shortly. - Bimafy`;
    case "approved":
      return `Good news ${first}: claim ${c.number} is approved${kes(c.approved) ? ` for ${kes(c.approved)}` : ""}. Payment is being processed. - Bimafy`;
    case "paid":
      return `Hi ${first}, ${kes(c.approved) ?? "your payment"} for claim ${c.number} has been paid. Thank you for trusting Bimafy.`;
    case "rejected":
      return `Hi ${first}, claim ${c.number} was not approved. ${agent ? `${agent} will` : "Your agent will"} call you to explain why and what you can do. - Bimafy`;
    default:
      return null;
  }
}

/** Public site address for links in texts. */
export function siteUrl(requestUrl?: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (configured) return configured.startsWith("http") ? configured.replace(/\/$/, "") : `https://${configured}`;
  return requestUrl ? new URL(requestUrl).origin : "https://bimafy.vercel.app";
}
