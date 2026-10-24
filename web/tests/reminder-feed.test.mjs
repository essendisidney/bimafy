import assert from "node:assert/strict";
import { test } from "node:test";
import { reminderQueue } from "../src/lib/engines/reminders.ts";
import { reminderMessage } from "../src/lib/i18n/reminders.ts";
import { feedPolicies } from "../src/lib/reminders-feed.ts";

const feed = {
  policies: [
    {
      id: "11111111-1111-4111-8111-111111111111", operator_id: "op", number: "POL-1", status: "active", frequency: "annually",
      contribution: "30000.00", inception: "2025-11-20", expiry: "2026-11-19", created_at: "2025-11-20T08:00:00Z",
      instalment_plan: { total: 30000, deposit: 6000, count: 4, every: "monthly", firstDue: "2026-11-15", createdAt: "2026-10-15T07:00:00Z" },
      participant_id: "p1", participant_name: "Amina Otieno", phone: "0712345678", product_name: "Motor Comprehensive Takaful",
      agent_id: "a1", agent_name: "Joseph Kamau",
    },
    {
      id: "22222222-2222-4222-8222-222222222222", operator_id: "op", number: "POL-2", status: "active", frequency: "annually",
      contribution: 12000, inception: "2025-11-20", expiry: "2026-11-19", created_at: "2025-11-20T08:00:00Z",
      instalment_plan: null, participant_id: "p2", participant_name: "Brian", phone: null, product_name: "Hospital Cash",
      agent_id: null, agent_name: null,
    },
  ],
  payments: [{ policy_number: "POL-1", amount: "6000.00", status: "completed", paid_at: "2026-10-15T08:00:00Z" }],
  sent: ["POL-2:renewal_30:2026-11-19"],
};

test("the morning job sees the same queue the Reminders screen would", () => {
  const f = feedPolicies(feed);
  assert.equal(f.policies[0].contribution, 30000);
  assert.equal(f.payments[0].amount, 6000);
  assert.equal(f.phones.get(feed.policies[0].id), "0712345678");
  assert.equal(f.phones.has(feed.policies[1].id), false);
  assert.equal(f.agentNames.get(feed.policies[0].id), "Joseph Kamau");

  const q = reminderQueue({ policies: f.policies, payments: f.payments, today: "2026-10-20", sent: f.sent });
  // POL-1: renewal day -30; deposit paid so no instalment reminder yet. POL-2's renewal was already sent.
  assert.deepEqual(q.due.map((r) => [r.policy.number, r.kind]), [["POL-1", "renewal_30"]]);
  assert.deepEqual(q.sent.map((r) => r.policy.number), ["POL-2"]);
});

test("every reminder is plain GSM text that fits in two SMS parts", () => {
  const f = feedPolicies(feed);
  const days = ["2026-10-20", "2026-11-12", "2026-11-15", "2026-11-18", "2026-11-22", "2026-11-25"];
  const kinds = new Set();
  for (const today of days) {
    for (const r of reminderQueue({ policies: f.policies, payments: f.payments, today }).due) {
      for (const lang of ["en", "sw"]) {
        kinds.add(r.kind);
        const url = "https://bimafy.vercel.app/pay/AbCdEfGhIjKlMnOpQrStUv";
        for (const payUrl of [undefined, url]) {
          const text = reminderMessage(lang, r, "Joseph", payUrl);
          assert.match(text, /^[\x20-\x7E]+$/, `${lang} ${r.kind} has non-GSM characters: ${text}`);
          assert.ok(text.length <= 306, `${lang} ${r.kind} is ${text.length} chars`);
          if (payUrl) {
            assert.ok(text.includes(url), `${lang} ${r.kind} lacks the link`);
            assert.ok(!/Reply YES|Jibu NDIYO/i.test(text), `${lang} ${r.kind} still asks for a reply`);
          }
        }
      }
    }
  }
  assert.ok(kinds.size >= 5, `covered ${[...kinds]}`);
});
