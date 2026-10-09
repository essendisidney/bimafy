import assert from "node:assert/strict";
import { test } from "node:test";
import {
  commissionStatement,
  crossSell,
  followUpAgenda,
  msisdn,
  pipelineSummary,
  renewalQueue,
  scoreLead,
  targetForecast,
} from "../src/lib/engines/agency.ts";

const now = new Date("2026-10-09T08:00:00Z");
const lead = (patch) => ({ id: "l", name: "X", phone: "+254700000000", productLine: "motor", status: "new", notes: "", ...patch });
const policy = (patch) => ({
  id: "p", number: "POL-1", participantId: "c1", participantName: "C", productId: "prd-motor", productName: "Motor",
  branch: "K", status: "active", channel: "agent", inception: "2025-10-28", expiry: "2026-10-27", sumCovered: 1,
  contribution: 60000, frequency: "annually", wakala: 0, tabarru: 0, createdAt: "2025-10-28", ...patch,
});
const lineOf = (id) => ({ "prd-motor": "motor", "prd-med": "medical", "prd-boda": "micro" })[id];

test("referred, recently-touched quoted lead scores hot; stale one cools", () => {
  const hot = scoreLead(lead({ status: "quoted", source: "referral", nextActionAt: "2026-10-09", activities: [{ id: "a", at: "2026-10-08T00:00:00Z", kind: "call", summary: "" }] }), now);
  const cold = scoreLead(lead({ source: "bulk_import", createdAt: "2026-08-01T00:00:00Z" }), now);
  assert.equal(hot.temperature, "hot");
  assert.equal(cold.temperature, "cold");
  assert.ok(cold.reasons.some((r) => r.includes("no follow-up")));
});

test("agenda buckets overdue / today / unscheduled and skips closed leads", () => {
  const a = followUpAgenda([
    lead({ id: "1", nextActionAt: "2026-10-01" }),
    lead({ id: "2", nextActionAt: "2026-10-09" }),
    lead({ id: "3" }),
    lead({ id: "4", status: "won", nextActionAt: "2026-10-01" }),
  ], now);
  assert.deepEqual([a.overdue.map((l) => l.id), a.today.map((l) => l.id), a.unscheduled.map((l) => l.id)], [["1"], ["2"], ["3"]]);
});

test("weighted pipeline uses stage probability and win rate excludes open leads", () => {
  const s = pipelineSummary([lead({ status: "quoted", value: 100000 }), lead({ status: "won" }), lead({ status: "lost" })]);
  assert.equal(s.weighted, 50000);
  assert.equal(s.winRate, 0.5);
});

test("renewal queue flags failed collections and keeps win-backs within grace", () => {
  const q = renewalQueue(
    [policy({}), policy({ id: "p2", number: "POL-2", expiry: "2026-09-01" }), policy({ id: "p3", number: "POL-3", expiry: "2026-05-01" })],
    [{ id: "x", reference: "r", policyNumber: "POL-1", participantName: "C", method: "mpesa_stk", status: "failed", amount: 1 }],
    now,
  );
  assert.deepEqual(q.map((r) => r.policy.id), ["p2", "p"]);
  assert.equal(q[0].bucket, "win_back");
  assert.ok(q[1].drivers.some((d) => d.includes("failed")));
});

test("commission earned on collections only, with first-year clawback", () => {
  const pays = [{ id: "1", reference: "r", policyNumber: "POL-1", participantName: "C", method: "mpesa_stk", status: "completed", amount: 60000 }];
  const ok = commissionStatement([policy({})], pays, lineOf, now);
  assert.equal(ok.totals.earned, 6000);
  assert.equal(ok.totals.clawback, 0);
  const lapsed = commissionStatement([policy({ status: "lapsed", inception: "2026-07-09" })], pays, lineOf, now);
  assert.ok(lapsed.totals.clawback > 4000 && lapsed.totals.clawback < 5000);
});

test("forecast projects run-rate to year end", () => {
  const f = targetForecast(7_500_000, 10_000_000, new Date("2026-07-02T12:00:00Z"));
  assert.ok(Math.abs(f.projected - 15_000_000) < 100_000);
  assert.equal(f.onTrack, true);
});

test("cross-sell suggests medical to motor owners", () => {
  const rows = crossSell([policy({})], [{ id: "c1", name: "C", phone: "1", dob: "1990-01-01" }], lineOf, now);
  assert.equal(rows[0].suggestions[0].line, "medical");
});

test("msisdn normalises Kenyan numbers", () => {
  assert.equal(msisdn("0712 345 678"), "254712345678");
  assert.equal(msisdn("+254 712 345678"), "254712345678");
});
