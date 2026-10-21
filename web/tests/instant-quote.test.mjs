import assert from "node:assert/strict";
import { test } from "node:test";
import { NEEDS, clampInput, priceNeed } from "../src/lib/instant-quote.ts";

test("every website option prices, and the annual value matches the frequency", () => {
  for (const n of NEEDS) {
    const r = priceNeed(n.slug);
    assert.ok(r && r.total >= 1, n.slug);
    const per = { daily: 365, weekly: 52, monthly: 12, quarterly: 4, annually: 1, single: 1 }[r.frequency];
    assert.equal(r.annual, r.total * per);
  }
  assert.equal(priceNeed("not-a-product"), null);
});

test("a hand-made request can't price outside the slider", () => {
  const car = NEEDS.find((n) => n.slug === "motor-comprehensive");
  assert.equal(clampInput(car, 99_999_999), car.ask.max);
  assert.equal(clampInput(car, -5), car.ask.min);
  assert.equal(clampInput(car, "abc"), car.ask.def);
  assert.equal(clampInput(car, 1_234_567), 1_250_000); // snapped to the 50,000 step
  // The server price for an absurd value equals the price at the slider's max.
  assert.equal(priceNeed("motor-comprehensive", 1e12).total, priceNeed("motor-comprehensive", car.ask.max).total);
});
