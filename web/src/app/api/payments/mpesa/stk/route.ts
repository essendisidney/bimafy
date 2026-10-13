import { NextResponse } from "next/server";
import { initiateStkPush } from "@/lib/mpesa/daraja";
import { savePendingStk } from "@/lib/mpesa/pending";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      phone?: string;
      amount?: number;
      accountReference?: string;
      description?: string;
      policyId?: string;
      policyNumber?: string;
      participantName?: string;
      participantId?: string;
    };

    if (!body.phone || !body.amount || !body.accountReference) {
      return NextResponse.json({ error: "phone, amount and accountReference are required" }, { status: 400 });
    }

    const result = await initiateStkPush({
      phone: body.phone,
      amount: body.amount,
      accountReference: body.accountReference,
      description: body.description,
    });

    const pending = await savePendingStk(result, {
      policyId: body.policyId,
      policyNumber: body.policyNumber,
      participantName: body.participantName?.slice(0, 120),
      participantId: body.participantId,
    });

    return NextResponse.json({
      ok: true,
      mode: result.mode,
      checkoutRequestId: result.checkoutRequestId,
      customerMessage: result.customerMessage,
      pending,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "STK initiation failed";
    // Bad input (phone, amount) is the caller's to fix; anything else is ours.
    const status = /phone|amount|KES/i.test(message) ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
