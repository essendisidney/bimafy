import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { kenyanMobile, sendSms, TAIFA_SMS_URL, taifaBody, taifaRejection } from "../src/lib/sms.ts";

test("Taifa uses the v2 endpoint and a plain JSON body", () => {
  assert.equal(TAIFA_SMS_URL, "https://api.taifamobile.co.ke/v2/sms/sendsms");
  assert.deepEqual(taifaBody("254712345678", "Hi Brian", "SIDNET"), {
    mobile: "254712345678",
    sender_name: "SIDNET",
    message: "Hi Brian",
    response_type: "json",
  });
});

test("Taifa status 1000 is success, anything else is a rejection", () => {
  assert.equal(taifaRejection('[{"status_code":"1000","status_desc":"Success","message_id":1}]'), null);
  assert.equal(taifaRejection('{"status_code":1000,"status_desc":"Success"}'), null);
  assert.equal(taifaRejection('[{"status_code":"1004","status_desc":"Low credits"}]'), "Taifa 1004: Low credits");
  assert.equal(taifaRejection("<html>404</html>"), "Bad response from Taifa: <html>404</html>");
});

test("sendSms posts to Taifa with the h_api_key header", async () => {
  let seen;
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen = { method: req.method, key: req.headers["h_api_key"], type: req.headers["content-type"], body: JSON.parse(raw) };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(seen.body.mobile === "254700000000"
        ? [{ status_code: "1003", status_desc: "Invalid mobile" }]
        : [{ status_code: "1000", status_desc: "Success", message_id: 42, credit_balance: "6.33" }]));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const env = { ...process.env };
  process.env.TAIFA_MOBILE_URL = `http://127.0.0.1:${server.address().port}/`;
  process.env.TAIFA_API_KEY = ' "your-taifa-api-key" ';
  delete process.env.TAIFA_MOBILE_SERVICE_NAME;
  delete process.env.TAIFA_SENDER_ID;
  try {
    const r = await sendSms("0712 345 678", "Habari");
    assert.equal(r.provider, "taifa");
    assert.equal(r.messageId, "42");
    assert.deepEqual(seen, {
      method: "POST",
      key: "your-taifa-api-key",
      type: "application/json",
      body: { mobile: "254712345678", sender_name: "SIDNET", message: "Habari", response_type: "json" },
    });
    await assert.rejects(sendSms("0700000000", "x"), /Taifa 1003: Invalid mobile/);
  } finally {
    process.env = env;
    server.close();
  }
});

test("only Kenyan mobiles are accepted", () => {
  assert.equal(kenyanMobile("0712 345 678"), "254712345678");
  assert.equal(kenyanMobile("+254 110 123456"), "254110123456");
  assert.equal(kenyanMobile("0201234567"), null); // landline
  assert.equal(kenyanMobile("12345"), null);
});
