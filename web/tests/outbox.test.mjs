import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPending, drain, enqueue, isNetworkError, readQueue } from "../src/lib/outbox.ts";

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
const K = "outbox";
const lead = (id, patch = {}) => ({ id, name: id, phone: "", productLine: "motor", status: "new", notes: "", activities: [], ...patch });

test("enqueue keeps order and survives a reload (same storage)", () => {
  const s = memoryStorage();
  enqueue(s, K, { kind: "create", lead: lead("a"), operatorId: "op" }, new Date(), "1");
  enqueue(s, K, { kind: "update", id: "a", patch: { status: "contacted" } }, new Date(), "2");
  assert.deepEqual(readQueue(s, K).map((o) => o.opId), ["1", "2"]);
});

test("drain sends oldest first and stops at the first retry, preserving order", async () => {
  const s = memoryStorage();
  for (const id of ["1", "2", "3"]) enqueue(s, K, { kind: "update", id: "a", patch: {} }, new Date(), id);
  const seen = [];
  const res = await drain(s, K, async (op) => {
    seen.push(op.opId);
    return op.opId === "2" ? { status: "retry" } : { status: "ok" };
  });
  assert.deepEqual(seen, ["1", "2"]);
  assert.deepEqual(res, { sent: 1, remaining: 2, dropped: [] });
  assert.deepEqual(readQueue(s, K).map((o) => o.opId), ["2", "3"]);
});

test("drain drops ops the server will never accept and reports why", async () => {
  const s = memoryStorage();
  enqueue(s, K, { kind: "update", id: "gone", patch: {} }, new Date(), "1");
  enqueue(s, K, { kind: "update", id: "a", patch: {} }, new Date(), "2");
  const res = await drain(s, K, async (op) => (op.opId === "1" ? { status: "drop", reason: "no access" } : { status: "ok" }));
  assert.equal(res.sent, 1);
  assert.equal(res.dropped[0].reason, "no access");
  assert.equal(s.m.has(K), false, "empty queue is removed from storage");
});

test("a crash mid-drain never replays an op that was already sent", async () => {
  const s = memoryStorage();
  enqueue(s, K, { kind: "update", id: "a", patch: {} }, new Date(), "1");
  enqueue(s, K, { kind: "update", id: "a", patch: {} }, new Date(), "2");
  await assert.rejects(drain(s, K, async (op) => {
    if (op.opId === "2") throw new Error("tab closed");
    return { status: "ok" };
  }));
  assert.deepEqual(readQueue(s, K).map((o) => o.opId), ["2"]);
});

test("applyPending overlays queued creates, updates and activities (idempotently)", () => {
  const act = { id: "act1", at: "2026-10-09T00:00:00Z", kind: "call", summary: "rang" };
  const ops = [
    { kind: "create", lead: lead("new"), operatorId: "op", opId: "1", queuedAt: "" },
    { kind: "update", id: "old", patch: { status: "quoted" }, opId: "2", queuedAt: "" },
    { kind: "activity", id: "old", activity: act, patch: {}, opId: "3", queuedAt: "" },
  ];
  const once = applyPending([lead("old")], ops);
  assert.deepEqual(once.map((l) => l.id), ["new", "old"]);
  assert.equal(once[1].status, "quoted");
  assert.equal(once[1].activities.length, 1);
  assert.equal(applyPending(once, ops)[1].activities.length, 1, "re-applying does not duplicate");
});

test("isNetworkError separates offline failures from real rejections", () => {
  assert.equal(isNetworkError({ message: "TypeError: Failed to fetch" }), true);
  assert.equal(isNetworkError({ message: "Load failed" }), true);
  assert.equal(isNetworkError(new TypeError("NetworkError when attempting to fetch resource.")), true);
  assert.equal(isNetworkError({ message: "new row violates row-level security policy", code: "42501" }), false);
  assert.equal(isNetworkError(null), false);
});
