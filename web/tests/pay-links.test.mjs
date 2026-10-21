import assert from "node:assert/strict";
import { test } from "node:test";
import { isPayToken, payLinkMessage } from "../src/lib/pay-links.ts";

test("pay link texts are plain GSM and fit two SMS parts with a real-length link", () => {
  const url = "https://bimafy.vercel.app/pay/AbCdEfGhIjKlMnOpQrSt_-";
  for (const lang of ["en", "sw"]) {
    const text = payLinkMessage(lang, {
      first: "Amina", amount: "KES 45,250", product: "Motor Comprehensive Takaful", number: "POL-MOT-88421", url, agent: "Joseph",
    });
    assert.match(text, /^[\x20-\x7E]+$/, text);
    assert.ok(text.includes(url));
    assert.ok(text.length <= 306, `${lang}: ${text.length}`);
  }
});

test("only well-formed tokens reach the database", () => {
  assert.ok(isPayToken("AbCdEfGhIjKlMnOpQrSt_-"));
  assert.equal(isPayToken("short"), false);
  assert.equal(isPayToken("AbCdEfGhIjKlMnOpQrSt_-x"), false);
  assert.equal(isPayToken("AbCdEfGhIjKlMnOpQrSt'-"), false);
});
