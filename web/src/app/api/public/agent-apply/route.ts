import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { applicantPhone, applicationProblem, applicationReceivedSms, type ApplicationInput } from "@/lib/agent-applications";
import { sendSms } from "@/lib/sms";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * "Become a Bimafy agent" from the public website: file the application
 * (public.agent_apply, which also throttles abuse) and text the applicant that
 * it arrived. Admins approve it from the Team page.
 */
export async function POST(request: Request) {
  let body: Partial<ApplicationInput> & { company?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  // Honeypot: people never see this field; form-filling bots do.
  if (body.company) return NextResponse.json({ ok: true });

  const input: ApplicationInput = {
    name: String(body.name ?? "").replace(/\s+/g, " ").trim(),
    phone: String(body.phone ?? ""),
    email: String(body.email ?? "").trim(),
    county: String(body.county ?? "").trim(),
    licenseNumber: String(body.licenseNumber ?? "").trim(),
    yearsExperience: String(body.yearsExperience ?? "").trim(),
    lines: Array.isArray(body.lines) ? body.lines.filter((l): l is string => typeof l === "string").slice(0, 10) : [],
    message: String(body.message ?? "").trim(),
  };
  const problem = applicationProblem(input);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const phone = applicantPhone(input.phone)!;

  // Demo deployments (no database) show the flow without filing or texting anyone.
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, demo: true });

  const { url, key } = getSupabaseEnv();
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await db.rpc("agent_apply", {
    p: {
      name: input.name,
      phone,
      email: input.email,
      county: input.county,
      license_number: input.licenseNumber,
      years_experience: input.yearsExperience,
      lines: input.lines,
      message: input.message,
      operator_id: process.env.NEXT_PUBLIC_OPERATOR_ID ?? "",
    },
  });
  if (error) {
    // Our own validation/throttle messages are written for the applicant; anything else isn't.
    const mine = error.code === "22023" || error.code === "P0001";
    return NextResponse.json(
      { error: mine ? error.message : "Something went wrong — please try again in a minute" },
      { status: mine ? (error.code === "P0001" ? 409 : 400) : 502 },
    );
  }

  // A courtesy: the application is already filed, so a failed SMS doesn't fail the request.
  await sendSms(phone, applicationReceivedSms(input.name)).catch(() => null);
  return NextResponse.json({ ok: true });
}
