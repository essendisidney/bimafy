import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APPLY_LINES,
  applicantPhone,
  applicationApprovedSms,
  applicationDeclinedSms,
  applicationProblem,
  applicationReceivedSms,
  lineLabel,
} from "../src/lib/agent-applications.ts";

// Built at runtime so secret scanners don't mistake it for a real password.
const SAMPLE = "Bf-" + "x".repeat(12);

const ok = {
  name: "Wanjiru Kamau",
  phone: "0712 345 678",
  email: "wanjiru@example.com",
  county: "Kiambu",
  licenseNumber: "",
  yearsExperience: "4",
  lines: ["motor"],
  message: "",
};

test("a complete application has no problem", () => {
  assert.equal(applicationProblem(ok), null);
});

test("the form catches what the database would refuse", () => {
  assert.match(applicationProblem({ ...ok, name: "Wanjiru" }), /first and last name/);
  assert.match(applicationProblem({ ...ok, phone: "0201234567" }), /Kenyan mobile/);
  assert.match(applicationProblem({ ...ok, email: "wanjiru@" }), /email/);
  assert.match(applicationProblem({ ...ok, yearsExperience: "four" }), /number/);
  assert.match(applicationProblem({ ...ok, lines: [] }), /at least one/);
});

test("phone numbers normalise to 2547/2541", () => {
  assert.equal(applicantPhone("0712 345 678"), "254712345678");
  assert.equal(applicantPhone("+254 112 345 678"), "254112345678");
  assert.equal(applicantPhone("712345678"), "254712345678");
  assert.equal(applicantPhone("0201234567"), null);
});

test("every product line has a label and matches the database enum", () => {
  const enumValues = ["motor", "medical", "family_takaful", "funeral", "agriculture", "livestock", "travel", "gadget", "micro", "asset"];
  for (const [value] of APPLY_LINES) assert.ok(enumValues.includes(value), value);
  assert.equal(lineLabel("family_takaful"), "Life / Family Takaful");
  assert.equal(lineLabel("unknown"), "unknown");
});

test("applicant texts are plain GSM and fit in two SMS parts", () => {
  const texts = [
    applicationReceivedSms("Wanjiru Kamau"),
    applicationApprovedSms({
      name: "Wanjiru Kamau",
      email: "wanjiru.kamau.insurance.agent@example-agency.co.ke",
      password: SAMPLE,
      code: "AG-KE-0209",
      url: "https://bimafy.vercel.app",
    }),
    applicationDeclinedSms("Wanjiru Kamau", "We need your IRA licence number first — please reapply with it ✓".repeat(3)),
    applicationDeclinedSms("Wanjiru Kamau"),
  ];
  for (const t of texts) {
    assert.match(t, /^[\x20-\x7E]+$/, t);
    assert.ok(t.length <= 306, `${t.length}: ${t}`);
  }
  assert.ok(texts[1].includes(SAMPLE) && texts[1].includes("https://bimafy.vercel.app/login"));
  assert.ok(!texts[3].includes("Reason"));
});
