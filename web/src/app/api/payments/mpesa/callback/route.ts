import { NextResponse } from "next/server";
import { callbackTokenValid, parseStkCallback, type StkCallbackBody } from "@/lib/mpesa/daraja";
import { applyStkResult } from "@/lib/mpesa/pending";

/**
 * Safaricom posts STK results here. The URL we give Safaricom carries
 * ?token=MPESA_CALLBACK_SECRET; anything without it is ignored, so nobody can
 * mark a payment as paid by posting a fake result.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!callbackTokenValid(token)) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Rejected" }, { status: 403 });
  }

  try {
    const parsed = parseStkCallback((await request.json()) as StkCallbackBody);
    const status = await applyStkResult(parsed, token!);
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted", status });
  } catch (err) {
    // Acknowledge anyway so Safaricom doesn't retry forever; the status check (STK Query) recovers.
    console.error("M-Pesa callback not applied:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
}
