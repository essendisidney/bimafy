import { NextResponse } from "next/server";
import { queryStkPush } from "@/lib/mpesa/daraja";
import { applyStkResult, claimStatusCheck, getPendingStk, settleSimulated } from "@/lib/mpesa/pending";

/** Ask Safaricom directly when the callback hasn't arrived after this long. */
const QUERY_AFTER_MS = 20_000;

/**
 * Status of ONE STK request, looked up by its CheckoutRequestID (the id is
 * the capability — there is deliberately no "list all" here).
 */
export async function GET(request: Request) {
  const checkoutRequestId = new URL(request.url).searchParams.get("checkoutRequestId");
  if (!checkoutRequestId || checkoutRequestId.length > 80) {
    return NextResponse.json({ error: "checkoutRequestId is required" }, { status: 400 });
  }

  try {
    let row = await getPendingStk(checkoutRequestId);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    row = await settleSimulated(row);

    // Callback late or lost: check with Safaricom (throttled to once per 10s per request).
    const secret = process.env.MPESA_CALLBACK_SECRET ?? "";
    if (
      row.status === "pending" &&
      row.mode === "live" &&
      secret &&
      Date.now() - Date.parse(row.createdAt) > QUERY_AFTER_MS &&
      (await claimStatusCheck(checkoutRequestId))
    ) {
      const outcome = await queryStkPush(checkoutRequestId).catch(() => ({ final: false as const }));
      if (outcome.final) {
        await applyStkResult(
          {
            checkoutRequestId,
            merchantRequestId: row.merchantRequestId,
            resultCode: outcome.resultCode,
            resultDesc: outcome.resultDesc,
            success: outcome.success,
          },
          secret,
        );
        row = (await getPendingStk(checkoutRequestId)) ?? row;
      }
    }

    return NextResponse.json(row, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Status check failed" }, { status: 502 });
  }
}
