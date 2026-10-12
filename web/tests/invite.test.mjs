import assert from "node:assert/strict";
import { test } from "node:test";
import { inviteMessage, newAgentProblem } from "../src/lib/invite.ts";
import { passwordProblem } from "../src/components/set-password-rules.ts";

// Obviously fake, low-entropy sample values (keeps secret scanners quiet).
const SAMPLE = "Bf-" + "x".repeat(12);
const ok = { fullName: "Amina Wanjiku", email: "amina@bimafy.app", phone: "0712 345 678", branchCode: "NBO", salesTarget: "500,000" };

test("new agent form accepts a complete entry and flags each problem", () => {
  assert.equal(newAgentProblem(ok), null);
  assert.match(newAgentProblem({ ...ok, fullName: "Amina" }), /first and last name/);
  assert.match(newAgentProblem({ ...ok, email: "amina@" }), /email/);
  assert.match(newAgentProblem({ ...ok, phone: "12345" }), /phone/);
  assert.equal(newAgentProblem({ ...ok, phone: "" }), null, "phone is optional");
  assert.match(newAgentProblem({ ...ok, salesTarget: "lots" }), /number/);
});

test("invite message carries the login, in English and Swahili", () => {
  const msg = inviteMessage({ name: "Amina Wanjiku", email: "amina@bimafy.app", password: SAMPLE, url: "https://bimafy.vercel.app/login", code: "AG-KE-0209" });
  assert.match(msg, /^Hi Amina, welcome to Bimafy! Your agent code is AG-KE-0209\./);
  assert.match(msg, /Email: amina@bimafy\.app/);
  assert.ok(msg.includes(`One-time password: ${SAMPLE}`));
  assert.match(msg, /Karibu Bimafy/);
  assert.match(inviteMessage({ name: "Amina", email: "a@b.co", password: SAMPLE, url: "u", reset: true }), /new one-time password/);
});

test("new password rules", () => {
  assert.match(passwordProblem("short1", "short1"), /8 characters/);
  assert.match(passwordProblem("onlyletters", "onlyletters"), /letters and numbers/);
  const same = "abcd" + "1234";
  assert.match(passwordProblem(same, same, same), /different/);
  const good = "abcd" + "12345";
  assert.match(passwordProblem(good, good + "6"), /match/);
  assert.equal(passwordProblem(good, good, SAMPLE), null);
});
