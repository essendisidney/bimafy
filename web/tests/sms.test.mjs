import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { test } from "node:test";
import { kenyanMobile, taifaBody, taifaEncrypt } from "../src/lib/sms.ts";

const IV = Buffer.from("w4^dgd$%^62:)dgs");
const keyBytes = (k) => { const b = Buffer.alloc(16); Buffer.from(k).copy(b, 0, 0, 16); return b; };

test("Taifa payload matches OpenSSL AES-128-CBC (what PHP openssl_encrypt uses)", () => {
  for (const key of ["short", "exactly16bytes!!", "a-much-longer-api-key-than-sixteen"]) {
    const plain = JSON.stringify({ message: "Habari Amina, malipo yako ni KES 6,000.", recepients: "254712345678" });
    const ours = taifaEncrypt(plain, key);
    const ref = execFileSync("openssl", ["enc", "-aes-128-cbc", "-K", keyBytes(key).toString("hex"), "-iv", IV.toString("hex")], {
      input: plain,
    }).toString("hex");
    assert.equal(ours, ref, `key ${key}`);
  }
});

test("Taifa body decrypts back to the message and recipient", () => {
  const body = taifaBody("254712345678", "Hi Brian", "test-key-123", "BIMAFY");
  assert.equal(body.key, "test-key-123");
  assert.equal(body.service_name, "BIMAFY");
  const d = createDecipheriv("aes-128-cbc", keyBytes("test-key-123"), IV);
  const plain = Buffer.concat([d.update(Buffer.from(body.message, "hex")), d.final()]).toString();
  assert.deepEqual(JSON.parse(plain), { message: "Hi Brian", recepients: "254712345678" });
  assert.equal(taifaBody("254712345678", "x", "k").service_name, null);
});

test("only Kenyan mobiles are accepted", () => {
  assert.equal(kenyanMobile("0712 345 678"), "254712345678");
  assert.equal(kenyanMobile("+254 110 123456"), "254110123456");
  assert.equal(kenyanMobile("0201234567"), null); // landline
  assert.equal(kenyanMobile("12345"), null);
});
