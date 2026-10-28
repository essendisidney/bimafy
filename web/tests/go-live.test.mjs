import assert from "node:assert/strict";
import { test } from "node:test";
import { goLiveChecklist, readiness } from "../src/lib/go-live.ts";

const server = (o = {}) => ({
  database: true, smsProvider: null, cronSecretSet: false, autoSend: false, remindersLang: "en",
  mpesaLive: false, mpesaEnv: "sandbox", mpesaCallbackSecretSet: false, siteUrl: "https://bimafy.vercel.app", ...o,
});
const db = (o = {}) => ({
  cron_registered: false, cron_matches: false, mpesa_registered: true, mpesa_matches: false, agents: 2, agents_public: 0,
  agents_with_phone: 2, products: 10, policies: 0, website_leads_30d: 0, auto_reminders_7d: 0, last_auto_reminder: null,
  failed_auto_reminders_7d: 0, paid_pay_links_30d: 0, reviews: 0, admin_phone: null, ...o,
});
const byId = (checks) => Object.fromEntries(checks.map((c) => [c.id, c]));

test("today's live setup: the right things are flagged with the right fixes", () => {
  const c = byId(goLiveChecklist(server(), db()));
  assert.equal(c.database.state, "done");
  assert.equal(c.sms.state, "todo");
  assert.match(c.sms.fix[0], /TAIFA_API_KEY/);
  assert.equal(c.server_secret.state, "todo");
  assert.match(c.server_secret.fix.join(" "), /CRON_SECRET/);
  assert.equal(c.auto_reminders.state, "warn"); // can't be switched on before SMS + secret
  assert.equal(c.mpesa.state, "todo");
  assert.equal(c.agents.state, "todo");
  assert.match(c.agents.detail, /none listed/);
  assert.equal(c.products.state, "optional");
  assert.equal(c.domain.state, "optional");
});

test("a set but unregistered secret offers the one-click connect", () => {
  const c = byId(goLiveChecklist(server({ cronSecretSet: true, smsProvider: "taifa" }), db()));
  assert.equal(c.server_secret.action.kind, "connect_cron");
  assert.equal(c.sms.action.kind, "test_sms");
  assert.equal(c.auto_reminders.state, "warn");
  const mismatch = byId(goLiveChecklist(server({ cronSecretSet: true }), db({ cron_registered: true })));
  assert.match(mismatch.server_secret.detail, /different secret/);
});

test("fully live reads as fully live", () => {
  const checks = goLiveChecklist(
    server({ smsProvider: "taifa", cronSecretSet: true, autoSend: true, remindersLang: "sw", mpesaLive: true, mpesaEnv: "production", siteUrl: "https://bimafy.co.ke" }),
    db({ cron_matches: true, mpesa_matches: true, agents_public: 2, policies: 40, auto_reminders_7d: 12, last_auto_reminder: "2026-10-21T05:00:00Z" }),
  );
  const r = readiness(checks);
  assert.equal(r.done, r.total);
  assert.match(byId(checks).auto_reminders.detail, /12 sent automatically.*Kiswahili/);
});

test("demo deployments say so", () => {
  const c = byId(goLiveChecklist(server({ database: false }), null));
  assert.equal(c.database.state, "todo");
  assert.equal(c.agents, undefined);
});
