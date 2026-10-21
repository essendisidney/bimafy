/** What /pay/<token> shows (public.pay_link_view, migration 00016). */
export type PayLinkView = {
  amount: number;
  purpose: "premium" | "instalment" | "renewal";
  note: string | null;
  status: "open" | "paid" | "expired";
  paid_at: string | null;
  expires_at: string;
  policy_id: string;
  policy_number: string;
  product_name: string;
  first_name: string;
  phone_hint: string | null;
  has_phone: boolean;
  agent_name: string | null;
  checkout_request_id: string | null;
  receipt: string | null;
};

/** Pay links are 22-character URL-safe tokens; anything else is never sent to the database. */
export const isPayToken = (t: string) => /^[A-Za-z0-9_-]{22}$/.test(t);

/** Demo deployments (no database) get one sample link so the flow can be shown end to end. */
export const DEMO_TOKEN = "demo";
export const DEMO_VIEW: PayLinkView = {
  amount: 4525,
  purpose: "instalment",
  note: "Instalment 1 of 4",
  status: "open",
  paid_at: null,
  expires_at: "2099-01-01T00:00:00Z",
  policy_id: "pol-1",
  policy_number: "POL-MOT-88421",
  product_name: "Motor Comprehensive Takaful",
  first_name: "Amina",
  phone_hint: "25471****111",
  has_phone: true,
  agent_name: "Joseph Otieno",
  checkout_request_id: null,
  receipt: null,
};

/** The SMS/WhatsApp text that carries a link. Plain GSM characters so it stays one cheap SMS part. */
export function payLinkMessage(lang: "en" | "sw", m: { first: string; amount: string; product: string; number: string; url: string; agent: string }) {
  return lang === "sw"
    ? `Habari ${m.first}, lipa ${m.amount} ya ${m.product} (${m.number}) kwa M-Pesa hapa: ${m.url} - ${m.agent}, Bimafy`
    : `Hi ${m.first}, pay ${m.amount} for your ${m.product} (${m.number}) by M-Pesa here: ${m.url} - ${m.agent}, Bimafy`;
}
