import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { money } from "@/lib/format";
import { PER, priceNeed } from "@/lib/instant-quote";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/config";
import { kenyanMobile, sendSms } from "@/lib/sms";

/**
 * "Get covered" from the public website: re-price the request, file it as a
 * lead for the least-busy active agent (public.request_cover, which also
 * throttles abuse), then text the client a confirmation and the agent the lead.
 */
export async function POST(request: Request) {
  let body: { name?: string; phone?: string; need?: string; value?: number; lang?: string; company?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const lang = body.lang === "sw" ? "sw" : "en";
  // Honeypot: people never see this field; form-filling bots do.
  if (body.company) return NextResponse.json({ ok: true, agentName: null });

  const name = (body.name ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: lang === "sw" ? "Andika jina lako" : "Please enter your name" }, { status: 400 });
  }
  const phone = kenyanMobile(body.phone ?? "");
  if (!phone) {
    return NextResponse.json(
      { error: lang === "sw" ? "Andika namba ya simu ya Kenya (07… au 01…)" : "Enter a Kenyan mobile number (07… or 01…)" },
      { status: 400 },
    );
  }
  const priced = priceNeed(body.need ?? "", body.value);
  if (!priced) return NextResponse.json({ error: "Unknown cover type" }, { status: 400 });

  const price = `${money(priced.total)}/${PER.en[priced.frequency]}`;
  const clientPrice = `${money(priced.total)}/${PER[lang][priced.frequency]}`;
  const detail =
    priced.need.ask?.kind === "sum"
      ? `, ${priced.need.ask.label.en.toLowerCase()} ${money(priced.input)}`
      : priced.need.ask?.kind === "age"
        ? `, age ${priced.input}`
        : "";
  const notes = `${priced.product.name}${detail}. Quoted ${price} on the website (${lang === "sw" ? "Kiswahili" : "English"}).`;

  // Demo deployments (no database) show the flow without filing or texting anyone.
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, demo: true, agentName: "Joseph Otieno", agentPhone: null });

  const { url, key } = getSupabaseEnv();
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("request_cover", {
    p: {
      name,
      phone,
      product_line: priced.product.line,
      notes,
      annual_value: priced.annual,
      operator_id: process.env.NEXT_PUBLIC_OPERATOR_ID ?? "",
    },
  });
  if (error) {
    // Our own validation/throttle messages are written for the client; anything else isn't.
    const mine = error.code === "22023" || error.code === "P0001";
    return NextResponse.json(
      { error: mine ? error.message : "Something went wrong — please try again or WhatsApp us" },
      { status: mine ? (error.code === "P0001" ? 429 : 400) : 502 },
    );
  }

  const lead = data as { lead_id: string; agent_name: string | null; agent_phone: string | null };
  const first = name.split(" ")[0];
  const agentFirst = lead.agent_name?.split(" ")[0];
  const agentPhone = lead.agent_phone ? kenyanMobile(lead.agent_phone) : null;
  const local = agentPhone ? `0${agentPhone.slice(3)}` : null;

  const toClient =
    lang === "sw"
      ? `Asante ${first}! Bimafy imepokea ombi lako la ${priced.product.name} (${clientPrice}). ${agentFirst ? `${agentFirst} atakupigia simu hivi punde${local ? ` kutoka ${local}` : ""}.` : "Wakala atakupigia simu hivi punde."}`
      : `Thank you ${first}! Bimafy has your request for ${priced.product.name} (${clientPrice}). ${agentFirst ? `${agentFirst} will call you shortly${local ? ` from ${local}` : ""}.` : "An agent will call you shortly."}`;
  const toAgent = `New Bimafy website lead: ${name}, 0${phone.slice(3)}. ${priced.product.name}${detail}, quoted ${price}. Please call within the hour.`;

  // Texts are a courtesy: the lead is already filed, so a failed SMS doesn't fail the request.
  await Promise.allSettled([
    sendSms(phone, toClient),
    agentPhone ? sendSms(agentPhone, toAgent) : Promise.resolve(null),
  ]);

  return NextResponse.json({ ok: true, agentName: lead.agent_name, agentPhone: agentPhone ? `+${agentPhone}` : null });
}
