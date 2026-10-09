import { NextResponse } from "next/server";
import { handleUssd } from "@/lib/channels/ussd";

/**
 * Africa's Talking-compatible USSD webhook.
 * Accepts JSON or form-encoded sessionId, phoneNumber, text, serviceCode.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let sessionId = "";
    let phoneNumber = "";
    let text = "";
    let serviceCode = "*384*90#";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, string>;
      sessionId = body.sessionId ?? body.session_id ?? crypto.randomUUID();
      phoneNumber = body.phoneNumber ?? body.phone_number ?? "";
      text = body.text ?? "";
      serviceCode = body.serviceCode ?? body.service_code ?? serviceCode;
    } else {
      const form = await request.formData();
      sessionId = String(form.get("sessionId") ?? form.get("session_id") ?? crypto.randomUUID());
      phoneNumber = String(form.get("phoneNumber") ?? form.get("phone_number") ?? "");
      text = String(form.get("text") ?? "");
      serviceCode = String(form.get("serviceCode") ?? form.get("service_code") ?? serviceCode);
    }

    if (!phoneNumber) {
      return new NextResponse("END Phone number required", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const result = handleUssd({ sessionId, phoneNumber, text, serviceCode });
    const payload = `${result.type} ${result.message}`;

    // Africa's Talking expects plain text: "CON message" or "END message"
    return new NextResponse(payload, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return new NextResponse(
      `END Error: ${err instanceof Error ? err.message : "USSD failed"}`,
      { status: 500, headers: { "Content-Type": "text/plain" } },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    service: "Bimafy USSD",
    shortcode: "*384*90#",
    webhook: "/api/channels/ussd",
    format: "Africa's Talking CON/END plain text",
  });
}
