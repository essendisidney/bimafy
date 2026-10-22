/**
 * The admin go-live checklist: what's connected, what isn't, and exactly what
 * to do about it. Pure, so it unit-tests; the server fills in the facts.
 */

export type ServerFacts = {
  database: boolean;
  smsProvider: "taifa" | "africastalking" | null;
  cronSecretSet: boolean;
  autoSend: boolean;
  remindersLang: "en" | "sw";
  mpesaLive: boolean;
  mpesaEnv: "sandbox" | "production";
  mpesaCallbackSecretSet: boolean;
  siteUrl: string;
};

export type DbFacts = {
  cron_registered: boolean;
  cron_matches: boolean;
  mpesa_registered: boolean;
  mpesa_matches: boolean;
  agents: number;
  agents_public: number;
  agents_with_phone: number;
  products: number;
  policies: number;
  website_leads_30d: number;
  auto_reminders_7d: number;
  last_auto_reminder: string | null;
  failed_auto_reminders_7d: number;
  paid_pay_links_30d: number;
  reviews: number;
  admin_phone: string | null;
};

export type CheckState = "done" | "todo" | "warn" | "optional";
export type CheckAction = "connect_cron" | "connect_mpesa" | "test_sms";
export type Check = {
  id: string;
  title: string;
  state: CheckState;
  detail: string;
  /** Plain steps to fix it, when it isn't done. */
  fix?: string[];
  action?: { kind: CheckAction; label: string };
  link?: { href: string; label: string };
};

const VERCEL_ENV = "In Vercel: bimafy → Settings → Environment Variables";

export function goLiveChecklist(s: ServerFacts, d: DbFacts | null): Check[] {
  const checks: Check[] = [];

  checks.push(
    s.database && d
      ? { id: "database", title: "Live database", state: "done", detail: "Bimafy is saving to your Supabase project." }
      : {
          id: "database",
          title: "Live database",
          state: "todo",
          detail: "The app is running on demo data.",
          fix: [`${VERCEL_ENV}, add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then redeploy.`],
        },
  );

  checks.push(
    s.smsProvider
      ? {
          id: "sms",
          title: "SMS",
          state: "done",
          detail: `Texts go out through ${s.smsProvider === "taifa" ? "Taifa Mobile" : "Africa's Talking"}. Send yourself a test to be sure.`,
          action: { kind: "test_sms", label: "Send me a test SMS" },
        }
      : {
          id: "sms",
          title: "SMS",
          state: "todo",
          detail: "No SMS provider is set, so reminders, sign-in codes and claim updates are only simulated.",
          fix: [`${VERCEL_ENV}, add TAIFA_MOBILE_API_KEY (your key from the Taifa Mobile dashboard), mark it Sensitive, then redeploy.`],
        },
  );

  if (!s.cronSecretSet) {
    checks.push({
      id: "server_secret",
      title: "Server secret",
      state: "todo",
      detail: "Needed for the 8am reminders and for customers to sign in to /my with an SMS code.",
      fix: [
        `${VERCEL_ENV}, add CRON_SECRET: a long random password only the server knows (at least 24 characters, not your Taifa key). Mark it Sensitive and redeploy.`,
        "Come back here and press “Connect to database”.",
      ],
    });
  } else if (!d?.cron_matches) {
    checks.push({
      id: "server_secret",
      title: "Server secret",
      state: "todo",
      detail: d?.cron_registered
        ? "The database has a different secret from the server, so the 8am run and customer sign-in are refused."
        : "CRON_SECRET is set on the server but the database doesn't know it yet.",
      action: { kind: "connect_cron", label: "Connect to database" },
    });
  } else {
    checks.push({ id: "server_secret", title: "Server secret", state: "done", detail: "The server and database agree, so the 8am run and SMS sign-in are allowed." });
  }

  const remindersReady = Boolean(s.smsProvider && d?.cron_matches);
  if (!s.autoSend) {
    checks.push({
      id: "auto_reminders",
      title: "8am reminders",
      state: remindersReady ? "todo" : "warn",
      detail: "Renewal and instalment reminders are listed on the Reminders screen but not sent automatically.",
      fix: [
        remindersReady
          ? `${VERCEL_ENV}, add REMINDERS_AUTO_SEND = true (and REMINDERS_LANG = sw for Kiswahili), then redeploy.`
          : "Finish SMS and the server secret first, then add REMINDERS_AUTO_SEND = true.",
      ],
      link: { href: "/app/reminders", label: "See today's reminders" },
    });
  } else if (!remindersReady) {
    checks.push({
      id: "auto_reminders",
      title: "8am reminders",
      state: "warn",
      detail: "Auto-send is on, but SMS or the server secret isn't ready, so nothing can go out yet.",
    });
  } else {
    const failed = d?.failed_auto_reminders_7d ?? 0;
    checks.push({
      id: "auto_reminders",
      title: "8am reminders",
      state: failed ? "warn" : "done",
      detail: d?.last_auto_reminder
        ? `${d.auto_reminders_7d} sent automatically in the last 7 days${failed ? `, ${failed} failed (they retry next morning — check SMS credit)` : ""}. Language: ${s.remindersLang === "sw" ? "Kiswahili" : "English"}.`
        : `On, in ${s.remindersLang === "sw" ? "Kiswahili" : "English"}. Nothing has been due yet.`,
      link: { href: "/app/reminders", label: "Reminders" },
    });
  }

  if (!s.mpesaLive) {
    checks.push({
      id: "mpesa",
      title: "M-Pesa",
      state: "todo",
      detail: "Payments are simulated: customers see the full flow but no money moves.",
      fix: [
        "Get Daraja (Lipa na M-Pesa Online) keys for your paybill or till from Safaricom.",
        `${VERCEL_ENV}, add MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_SECRET (a long random password) and MPESA_ENV = production. Redeploy.`,
        "Come back here and press “Connect to database” for M-Pesa.",
      ],
    });
  } else if (!d?.mpesa_matches) {
    checks.push({
      id: "mpesa",
      title: "M-Pesa",
      state: "todo",
      detail: "M-Pesa is live, but the database doesn't recognise the callback secret, so confirmed payments can't be recorded.",
      action: { kind: "connect_mpesa", label: "Connect to database" },
    });
  } else {
    checks.push({
      id: "mpesa",
      title: "M-Pesa",
      state: s.mpesaEnv === "production" ? "done" : "warn",
      detail:
        s.mpesaEnv === "production"
          ? `Live payments on. ${d.paid_pay_links_30d} paid through pay links in the last 30 days.`
          : "Connected to the Safaricom sandbox — set MPESA_ENV = production when you're ready for real money.",
    });
  }

  if (d) {
    checks.push(
      d.agents === 0
        ? { id: "agents", title: "Agents", state: "todo", detail: "No active agents yet.", link: { href: "/app/team", label: "Add agents" } }
        : d.agents_public === 0
          ? {
              id: "agents",
              title: "Agents",
              state: "todo",
              detail: `${d.agents} active agent${d.agents === 1 ? "" : "s"}, none listed on /agents yet. Each agent opens Profile → “Your public profile”, writes a short bio and ticks “Show me in the agent directory”.`,
              link: { href: "/agents", label: "Open the directory" },
            }
          : {
              id: "agents",
              title: "Agents",
              state: d.agents_with_phone < d.agents ? "warn" : "done",
              detail: `${d.agents_public} of ${d.agents} agents listed publicly, ${d.reviews} customer review${d.reviews === 1 ? "" : "s"}.${d.agents_with_phone < d.agents ? " Some agents have no phone number, so they can't get lead and claim texts." : ""}`,
              link: { href: "/agents", label: "Open the directory" },
            },
    );
    checks.push(
      d.products === 0
        ? { id: "products", title: "Products", state: "todo", detail: "No active products to sell.", link: { href: "/app/products", label: "Products" } }
        : {
            id: "products",
            title: "Products & first sales",
            state: d.policies ? "done" : "optional",
            detail: `${d.products} products live. ${d.policies ? `${d.policies} policies on the books` : "No policies yet — sell the first one from the agent desk"}, ${d.website_leads_30d} website lead${d.website_leads_30d === 1 ? "" : "s"} in 30 days.`,
            link: { href: "/app/agent", label: "Agent desk" },
          },
    );
  }

  checks.push(
    /vercel\.app$/i.test(new URL(s.siteUrl).hostname)
      ? {
          id: "domain",
          title: "Your own web address",
          state: "optional",
          detail: `Customers see ${new URL(s.siteUrl).hostname}. A domain such as bimafy.co.ke looks more trustworthy in SMS links.`,
          fix: ["Buy the domain, add it in Vercel: bimafy → Settings → Domains, then set NEXT_PUBLIC_SITE_URL to it."],
        }
      : { id: "domain", title: "Your own web address", state: "done", detail: `Links point to ${new URL(s.siteUrl).hostname}.` },
  );

  return checks;
}

export function readiness(checks: Check[]) {
  const required = checks.filter((c) => c.state !== "optional");
  const done = required.filter((c) => c.state === "done").length;
  return { done, total: required.length };
}
