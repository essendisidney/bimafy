import assert from "node:assert/strict";
import { test } from "node:test";
import { codeMessage, demoPortal, portalPolicyToPolicy } from "../src/lib/portal.ts";

test("the sign-in SMS is one plain GSM part and warns against sharing", () => {
  const t = codeMessage("482913");
  assert.match(t, /^[\x20-\x7E]+$/);
  assert.ok(t.length <= 160, String(t.length));
  assert.ok(t.includes("482913") && /never share/i.test(t));
});

test("portal policies map back to the app's Policy so certificates work", () => {
  const demo = demoPortal();
  assert.equal(demo.first_name, "Amina");
  assert.ok(demo.policies.length >= 1);
  const p = portalPolicyToPolicy({ ...demo.policies[0], sum_covered: "1200000.00", contribution: "45000.00", wakala: "0", tabarru: "0" });
  assert.equal(p.sumCovered, 1_200_000);
  assert.equal(p.contribution, 45_000);
  assert.equal(p.number, demo.policies[0].number);
  // Only this customer's policies, payments and claims.
  const numbers = new Set(demo.policies.map((x) => x.number));
  assert.ok(demo.payments.every((x) => numbers.has(x.policy_number)));
  assert.ok(demo.claims.every((x) => numbers.has(x.policy_number)));
});
