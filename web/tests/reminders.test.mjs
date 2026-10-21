import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addMonths,
  instalmentSchedule,
  planStatus,
  reminderQueue,
  validatePlan,
} from "../src/lib/engines/reminders.ts";

const plan = (extra = {}) => ({
  total: 30_000, deposit: 6_000, count: 4, every: "monthly", firstDue: "2026-11-15",
  createdAt: "2026-10-15T07:00:00Z", ...extra,
});
const policy = (number, extra = {}) => ({
  id: number, number, participantId: "p", participantName: "Amina Otieno", productId: "motor", productName: "Motor",
  branch: "Kisumu", status: "active", channel: "agent", inception: "2025-11-20", expiry: "2026-11-19",
  sumCovered: 1_000_000, contribution: 30_000, frequency: "annually", wakala: 0, tabarru: 0,
  createdAt: "2025-11-20T08:00:00Z", ...extra,
});
const pay = (amount, paidAt, policyNumber = "POL-1", status = "completed") => ({
  id: paidAt, reference: paidAt, policyNumber, participantName: "A", method: "mpesa_stk", status, amount, paidAt,
});

test("month arithmetic clamps to the month end", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
});

test("schedule: deposit today, equal whole-shilling instalments, last absorbs rounding", () => {
  const rows = instalmentSchedule(plan({ total: 10_000, deposit: 1_000, count: 7 }));
  assert.equal(rows[0].label, "deposit");
  assert.equal(rows[0].due, "2026-10-15");
  assert.deepEqual(rows.slice(1).map((r) => r.due).slice(0, 3), ["2026-11-15", "2026-12-15", "2027-01-15"]);
  assert.equal(rows.reduce((s, r) => s + r.amount, 0), 10_000);
  assert.ok(rows.slice(1).every((r) => Number.isInteger(r.amount)));
  assert.equal(rows.at(-1).amount, 9_000 - 1285 * 6);

  const weekly = instalmentSchedule(plan({ deposit: 0, count: 3, every: "weekly", firstDue: "2026-10-20" }));
  assert.deepEqual(weekly.map((r) => r.due), ["2026-10-20", "2026-10-27", "2026-11-03"]);
});

test("validation catches bad plans", () => {
  assert.equal(validatePlan(plan()), null);
  assert.match(validatePlan(plan({ deposit: 30_000 })), /deposit/);
  assert.match(validatePlan(plan({ count: 0 })), /instalments/);
  assert.match(validatePlan(plan({ count: 13 })), /instalments/);
  assert.match(validatePlan(plan({ total: 0 })), /premium/);
});

test("status applies money oldest first and grades lateness", () => {
  const p = plan();
  const onTrack = planStatus(p, 6_000, "2026-11-01");
  assert.equal(onTrack.health, "on_track");
  assert.equal(onTrack.next.n, 1);
  assert.equal(onTrack.balance, 24_000);

  const part = planStatus(p, 9_000, "2026-11-01");
  assert.equal(part.rows[1].state, "part");
  assert.equal(part.rows[1].paid, 3_000);

  const behind = planStatus(p, 6_000, "2026-11-20");
  assert.equal(behind.health, "behind");
  assert.equal(behind.daysLate, 5);
  assert.equal(behind.overdueAmount, 6_000);
  assert.equal(behind.rows[1].state, "overdue");

  const risk = planStatus(p, 6_000, "2026-12-16");
  assert.equal(risk.health, "at_risk");
  assert.equal(risk.overdueAmount, 12_000);

  assert.equal(planStatus(p, 30_000, "2027-03-01").health, "complete");
  assert.equal(planStatus(p, 0, "2026-10-15").rows[0].state, "due");
});

test("renewal reminders: right touch on the right day, never stale ones", () => {
  const pol = policy("POL-1"); // expires 2026-11-19
  const at = (today) => reminderQueue({ policies: [pol], payments: [], today }).due.map((r) => r.kind);
  assert.deepEqual(at("2026-10-20"), ["renewal_30"]);
  assert.deepEqual(at("2026-10-22"), ["renewal_30"]); // still fresh
  assert.deepEqual(at("2026-10-25"), []); // missed day -30, wait for day -7
  assert.deepEqual(at("2026-11-12"), ["renewal_7"]);
  assert.deepEqual(at("2026-11-18"), ["renewal_1"]);
  assert.deepEqual(at("2026-11-22"), ["renewal_lapsed"]);
  assert.deepEqual(at("2026-12-10"), []);

  const upcoming = reminderQueue({ policies: [pol], payments: [], today: "2026-11-08" }).upcoming;
  assert.deepEqual(upcoming.map((r) => [r.kind, r.sendOn]), [["renewal_7", "2026-11-12"]]);
});

test("sent reminders drop off the queue; cancelled and single-premium cover is left alone", () => {
  const pol = policy("POL-1");
  const first = reminderQueue({ policies: [pol], payments: [], today: "2026-10-20" });
  const again = reminderQueue({ policies: [pol], payments: [], today: "2026-10-20", sent: new Set([first.due[0].key]) });
  assert.equal(again.due.length, 0);
  assert.equal(again.sent.length, 1);

  const quiet = [policy("C", { status: "cancelled" }), policy("S", { frequency: "single" })];
  assert.equal(reminderQueue({ policies: quiet, payments: [], today: "2026-10-20" }).due.length, 0);
});

test("instalment reminders ask for what is owed and stop once paid", () => {
  const pol = policy("POL-1", { expiry: "2027-10-14", instalmentPlan: plan() });
  const deposit = pay(6_000, "2026-10-15T08:00:00Z");
  const old = pay(30_000, "2025-11-20T08:00:00Z"); // last year's premium doesn't count
  const q = (today, payments) => reminderQueue({ policies: [pol], payments, today }).due;

  const soon = q("2026-11-12", [deposit, old]);
  assert.deepEqual(soon.map((r) => [r.kind, r.amount, r.instalment]), [["instalment_soon", 6_000, { n: 1, of: 4 }]]);

  const late = q("2026-11-18", [deposit]);
  assert.deepEqual(late.map((r) => r.kind), ["instalment_late"]);

  const final = q("2026-11-25", [deposit]);
  assert.equal(final[0].kind, "instalment_final");

  // Paid instalment 1 → the next reminders are about instalment 2.
  const paid1 = pay(6_000, "2026-11-15T10:00:00Z");
  assert.equal(q("2026-11-18", [deposit, paid1]).length, 0);
  const n2 = q("2026-12-12", [deposit, paid1]);
  assert.deepEqual(n2.map((r) => [r.kind, r.instalment.n]), [["instalment_soon", 2]]);

  // Deposit not paid on day one → it's due today.
  assert.deepEqual(q("2026-10-15", []).map((r) => [r.kind, r.amount, r.instalment.n]), [["instalment_today", 6_000, 0]]);
});

test("queue puts money already late ahead of polite early nudges", () => {
  const late = policy("LATE", { expiry: "2027-10-14", instalmentPlan: plan() });
  const early = policy("EARLY", { expiry: "2026-12-14" }); // day -30 is 2026-11-14
  const q = reminderQueue({ policies: [early, late], payments: [pay(6_000, "2026-10-15T08:00:00Z", "LATE")], today: "2026-11-15" });
  assert.deepEqual(q.due.map((r) => [r.policy.number, r.kind]), [["LATE", "instalment_today"], ["EARLY", "renewal_30"]]);
});
