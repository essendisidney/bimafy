import assert from "node:assert/strict";
import { test } from "node:test";
import { getPublicAgent, listPublicAgents, ratingLabel } from "../src/lib/public-agents.ts";

test("ratings read naturally and new agents aren't shown as badly rated", () => {
  assert.equal(ratingLabel({ rating: null, reviews: 0 }), "New on Bimafy");
  assert.equal(ratingLabel({ rating: 4.75, reviews: 1 }), "4.8 (1 review)");
  assert.equal(ratingLabel({ rating: 4, reviews: 12 }), "4.0 (12 reviews)");
});

test("demo directory has no invented reviews, and bad slugs never reach the database", async () => {
  const all = await listPublicAgents();
  assert.ok(all.length >= 2);
  assert.ok(all.every((a) => a.reviews === 0 && a.rating === null));
  assert.equal((await getPublicAgent("joseph-otieno"))?.name, "Joseph Otieno");
  assert.equal(await getPublicAgent("../etc/passwd"), null);
  assert.equal(await getPublicAgent("JOSEPH"), null);
});
