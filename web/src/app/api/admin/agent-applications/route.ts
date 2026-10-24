import { NextResponse } from "next/server";
import { applicationApprovedSms, applicationDeclinedSms } from "@/lib/agent-applications";
import { siteUrl } from "@/lib/claim-messages";
import { kenyanMobile, sendSms } from "@/lib/sms";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type Decided = {
  status: "approved" | "declined";
  name: string;
  phone: string;
  email?: string;
  agent_code?: string;
  agent_id?: string;
  temp_password?: string;
};

/**
 * An admin or branch manager approves or declines an agent application
 * (public.agent_application_decide checks who they are). Approving creates the
 * login; either way the applicant gets a text. Runs as the signed-in admin.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    approve?: boolean;
    licenseChecked?: boolean;
    branchCode?: string;
    reason?: string;
  };
  if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ error: "Unknown application" }, { status: 400 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Approving agents needs the live database" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agent_application_decide", {
    p_id: body.id,
    p_approve: body.approve === true,
    p_license_checked: body.licenseChecked === true,
    p_branch_code: body.branchCode || null,
    p_reason: body.reason ?? null,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "P0001" || error.code === "22023" || error.code === "23505" ? 409 : 502;
    return NextResponse.json({ error: status === 502 ? "Couldn't save the decision — try again" : error.message }, { status });
  }

  const d = data as Decided;
  const phone = kenyanMobile(d.phone);
  const text =
    d.status === "approved"
      ? applicationApprovedSms({ name: d.name, email: d.email ?? "", password: d.temp_password ?? "", code: d.agent_code, url: siteUrl(req.url) })
      : applicationDeclinedSms(d.name, body.reason);
  let texted = false;
  if (phone) {
    try {
      await sendSms(phone, text);
      texted = true;
    } catch {
      texted = false;
    }
  }
  // The admin's screen shows the login too, so it can be sent on WhatsApp if the SMS didn't go.
  return NextResponse.json({
    ok: true,
    status: d.status,
    texted,
    agent: d.status === "approved" ? { code: d.agent_code, email: d.email, password: d.temp_password } : null,
  });
}
