import assert from "node:assert/strict";
import { test } from "node:test";
import {
  callbackTokenValid,
  formatKenyanPhone,
  interpretStkQuery,
  parseStkCallback,
  stkTimestamp,
} from "../src/lib/mpesa/daraja.ts";

test("timestamps are Kenyan time whatever the server's timezone", () => {
  // 21:30 UTC is 00:30 the next day in Nairobi.
  assert.equal(stkTimestamp(new Date("2026-10-12T21:30:05Z")), "20261013003005");
});

test("phones normalise to 2547/2541 format and junk is refused", () => {
  assert.equal(formatKenyanPhone("0712 345 678"), "254712345678");
  assert.equal(formatKenyanPhone("+254712345678"), "254712345678");
  assert.equal(formatKenyanPhone("712345678"), "254712345678");
  assert.throws(() => formatKenyanPhone("12345"), /Invalid Kenyan phone/);
});

test("callback token must match the secret exactly", () => {
  const secret = "s".repeat(32);
  assert.equal(callbackTokenValid(secret, secret), true);
  assert.equal(callbackTokenValid("s".repeat(31) + "t", secret), false);
  assert.equal(callbackTokenValid(null, secret), false);
  assert.equal(callbackTokenValid("", ""), false, "no secret configured means nothing is accepted");
});

test("STK Query: still processing vs paid vs cancelled", () => {
  assert.deepEqual(interpretStkQuery({ errorCode: "500.001.1001", errorMessage: "The transaction is being processed" }), { final: false });
  assert.deepEqual(interpretStkQuery({ ResponseCode: "0", ResultCode: "0", ResultDesc: "processed successfully" }), {
    final: true, success: true, resultCode: 0, resultDesc: "processed successfully",
  });
  const cancelled = interpretStkQuery({ ResponseCode: "0", ResultCode: "1032", ResultDesc: "Request cancelled by user" });
  assert.equal(cancelled.final && cancelled.success, false);
  assert.equal(cancelled.final && cancelled.resultCode, 1032);
});

test("callback payload parses receipt, amount and phone", () => {
  const parsed = parseStkCallback({
    Body: { stkCallback: {
      MerchantRequestID: "m1", CheckoutRequestID: "ws_CO_1", ResultCode: 0, ResultDesc: "ok",
      CallbackMetadata: { Item: [
        { Name: "Amount", Value: 450 }, { Name: "MpesaReceiptNumber", Value: "QAB1CD2EF3" },
        { Name: "PhoneNumber", Value: 254712345678 },
      ] },
    } },
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.amount, 450);
  assert.equal(parsed.mpesaReceiptNumber, "QAB1CD2EF3");
  assert.equal(parsed.phone, "254712345678");
  assert.throws(() => parseStkCallback({}), /Invalid STK callback/);
});
