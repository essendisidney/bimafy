import { NextResponse } from "next/server";
import { replyWhatsApp } from "@/lib/channels/whatsapp";

/**
 * Inbound WhatsApp webhook (Meta / Africa's Talking style simplified).
 * Body: { from, text } or { entry: [...] } Meta envelope (text extracted when present).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    let from = String(body.from ?? body.phone ?? "");
    let text = String(body.text ?? body.message ?? "");

    // Minimal Meta Cloud API shape support
    const entry = body.entry as Array<{ changes?: Array<{ value?: { messages?: Array<{ from?: string; text?: { body?: string } }> } }> }> | undefined;
    const msg = entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (msg) {
      from = msg.from ?? from;
      text = msg.text?.body ?? text;
    }

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const result = replyWhatsApp(text);
    return NextResponse.json({
      ok: true,
      from,
      ...result,
      messages: result.replies.map((t) => ({
        to: from || "customer",
        type: "text",
        text: { body: t },
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "WhatsApp webhook failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  // Meta webhook verification challenge
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const verify = process.env.WHATSAPP_VERIFY_TOKEN ?? "bimafy-whatsapp";

  if (mode === "subscribe" && token === verify && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({
    service: "Bimafy WhatsApp",
    webhook: "/api/channels/whatsapp",
    verifyTokenEnv: "WHATSAPP_VERIFY_TOKEN",
  });
}
