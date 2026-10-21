import assert from "node:assert/strict";
import { test } from "node:test";
import { NOTIFY_STEPS, claimStepMessage, siteUrl } from "../src/lib/claim-messages.ts";

const info = { number: "CLM-2026-82042", first_name: "Otieno", phone: "0712000777", policy_number: "POL-1", approved: "21500.00", claimed: 25000, agent_name: "Joseph Otieno" };

test("every customer-facing claim step has a short, plain text", () => {
  for (const s of NOTIFY_STEPS) {
    const t = claimStepMessage(s, info, "https://bimafy.vercel.app");
    assert.ok(t, s);
    assert.match(t, /^[\x20-\x7E]+$/, `${s}: ${t}`);
    assert.ok(t.length <= 306, `${s}: ${t.length}`);
    assert.ok(t.includes("CLM-2026-82042"));
  }
  assert.match(claimStepMessage("documents_pending", info, "https://bimafy.vercel.app"), /bimafy\.vercel\.app\/my/);
  assert.match(claimStepMessage("approved", info, "x"), /KES 21,500/);
  assert.match(claimStepMessage("rejected", info, "x"), /Joseph will call/);
});

test("internal steps don't text the customer", () => {
  for (const s of ["reported", "under_review", "fraud_check", "assessing", "estimated", "pending_approval", "closed"]) {
    assert.equal(claimStepMessage(s, info, "x"), null, s);
  }
});

test("site links use the configured domain", () => {
  const before = { ...process.env };
  process.env.NEXT_PUBLIC_SITE_URL = "";
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "bimafy.vercel.app";
  assert.equal(siteUrl("http://localhost:3000/api/x"), "https://bimafy.vercel.app");
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "";
  assert.equal(siteUrl("http://localhost:3000/api/x"), "http://localhost:3000");
  Object.assign(process.env, before);
});
