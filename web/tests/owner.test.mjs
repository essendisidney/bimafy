import assert from "node:assert/strict";
import { test } from "node:test";
import { eatDay, ownerSummary } from "../src/lib/engines/owner.ts";

const now = new Date("2026-10-13T09:00:00Z"); // 12:00 in Nairobi
const pay = (id, amount, paidAt, status = "completed", policyNumber = "POL-1") => ({
  id, reference: id, policyNumber, participantName: "C", method: "mpesa_stk", status, amount, paidAt,
});
const policy = (number, agentId, extra = {}) => ({
  id: number, number, participantId: "p", participantName: "Client", productId: "motor", productName: "Motor",
  agentId, branch: "Kisumu", status: "active", channel: "agent", inception: "2026-01-10", expiry: "2027-01-09",
  sumCovered: 1_000_000, contribution: 4_500, frequency: "monthly", wakala: 0, tabarru: 0,
  createdAt: "2026-10-02T08:00:00Z", ...extra,
});
const lead = (id, agentId, status, extra = {}) => ({
  id, name: id, phone: "", productLine: "motor", status, agentId, notes: "", createdAt: "2026-10-05T08:00:00Z", ...extra,
});

test("Nairobi day boundaries, not UTC", () => {
  assert.equal(eatDay("2026-10-12T21:30:00Z"), "2026-10-13");
  assert.equal(eatDay("2026-10-12T20:59:00Z"), "2026-10-12");
});

test("money in: today, month, like-for-like change and daily series", () => {
  const s = ownerSummary({
    policies: [policy("POL-1", "a-1")],
    payments: [
      pay("t1", 1000, "2026-10-13T06:00:00Z"),
      pay("late-yesterday-utc", 500, "2026-10-12T22:00:00Z"), // already "today" in Nairobi
      pay("m1", 2000, "2026-10-03T10:00:00Z"),
      pay("prev-early", 1750, "2026-09-05T10:00:00Z"),
      pay("prev-late", 9999, "2026-09-28T10:00:00Z"), // after day 13 of last month: not like-for-like
      pay("failed", 300, "2026-10-13T07:00:00Z", "failed"),
    ],
    leads: [],
    agents: [],
    now,
  });
  assert.equal(s.today, "2026-10-13");
  assert.equal(s.collectedToday, 1500);
  assert.equal(s.collectedMonth, 3500);
  assert.equal(s.collectedPrevMonth, 11749);
  assert.equal(s.monthChange, (3500 - 1750) / 1750);
  assert.equal(s.daily.length, 14);
  assert.deepEqual(s.daily.at(-1), { day: "2026-10-13", amount: 1500, count: 2 });
  assert.equal(s.failedAmount, 300);
});

test("agents: conversion, overdue follow-ups, premium and commission per agent", () => {
  const agents = [
    { id: "a-1", dbId: "uuid-1", name: "Joseph", branch: "Kisumu" },
    { id: "a-2", name: "Mary", branch: "Nairobi" },
  ];
  const s = ownerSummary({
    policies: [policy("POL-1", "uuid-1"), policy("POL-2", "a-2")],
    payments: [pay("p1", 4500, "2026-10-03T10:00:00Z", "completed", "POL-1")],
    leads: [
      lead("l1", "uuid-1", "won", { activities: [{ id: "x", at: "2026-10-04T10:00:00Z", kind: "status", summary: "won" }] }),
      lead("l2", "a-1", "lost"),
      lead("l3", "a-1", "new", { nextActionAt: "2026-10-01" }),
      lead("l4", "a-2", "contacted", { value: 50000 }),
    ],
    agents,
    lineOf: () => "motor",
    now,
  });
  const joseph = s.agents.find((a) => a.name === "Joseph");
  assert.equal(joseph.openLeads, 1);
  assert.equal(joseph.wonThisMonth, 1);
  assert.equal(joseph.conversion, 0.5);
  assert.equal(joseph.overdue, 1);
  assert.equal(joseph.premiumCollected, 4500);
  assert.ok(joseph.commissionOwed > 0);
  assert.equal(s.agents[0].name, "Joseph", "sorted by premium collected");
  assert.equal(s.openPipeline, 50000);
  assert.equal(s.conversion, 0.5);
  assert.equal(s.newLeadsMonth, 4);
  assert.equal(s.policiesSoldMonth, 2);
});

test("renewals at risk only lists high-risk policies expiring soon", () => {
  const s = ownerSummary({
    policies: [
      policy("SAFE", "a-1", { expiry: "2027-06-01" }),
      policy("RISKY", "a-1", { expiry: "2026-10-20", status: "lapsed" }),
    ],
    payments: [pay("f", 4500, "2026-10-01T10:00:00Z", "failed", "RISKY")],
    leads: [],
    agents: [],
    now,
  });
  assert.deepEqual(s.renewalsAtRisk.map((r) => r.policy.number), ["RISKY"]);
});
