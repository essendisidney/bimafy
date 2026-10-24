"use client";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isUuid } from "@/lib/ids";
import type { Application } from "./agent-applications";
import type { SessionUser } from "./types";

/**
 * Admin-side agent onboarding. All writes go through SECURITY DEFINER
 * functions (supabase/migrations/00012_agent_onboarding.sql) that check the
 * caller is an admin or branch manager of the same operator.
 */

export type TeamAgent = {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  status: "active" | "suspended" | string;
  branch: string;
  hasLogin: boolean;
  createdAt: string;
};

export type Branch = { code: string; name: string };

export type CreatedAgent = { agentId: string; code: string; email: string; tempPassword: string };

async function sb() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient();
}

/** Real onboarding needs a real (Supabase) admin or branch manager session; demo personas can only look. */
export function canManageAgents(user: SessionUser | null) {
  return Boolean(
    user && isSupabaseConfigured() && isUuid(user.id) && (user.role === "admin" || user.role === "branch_manager"),
  );
}

/** Postgres messages from our functions are already written for people; strip the plumbing. */
function friendly(error: { message?: string } | null) {
  const message = error?.message ?? "Something went wrong. Try again.";
  if (/failed to fetch|network/i.test(message)) return "No connection. Adding agents needs internet.";
  return message.replace(/^.*?ERROR:\s*/i, "");
}

type AgentRow = {
  id: string;
  agent_code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  status: string;
  profile_id: string | null;
  created_at: string;
  branches: { name: string } | null;
};

export async function listTeam(operatorId: string): Promise<TeamAgent[]> {
  const client = await sb();
  const { data, error } = await client
    .from("agents")
    .select("id, agent_code, full_name, phone, email, status, profile_id, created_at, branches(name)")
    .eq("operator_id", operatorId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(friendly(error));
  return ((data ?? []) as unknown as AgentRow[]).map((r) => ({
    id: r.id,
    code: r.agent_code,
    name: r.full_name,
    phone: r.phone ?? "",
    email: r.email ?? "",
    status: r.status,
    branch: r.branches?.name ?? "—",
    hasLogin: Boolean(r.profile_id),
    createdAt: r.created_at,
  }));
}

export async function listBranches(operatorId: string): Promise<Branch[]> {
  const client = await sb();
  const { data, error } = await client
    .from("branches")
    .select("code, name")
    .eq("operator_id", operatorId)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(friendly(error));
  return (data ?? []) as Branch[];
}

export async function createAgent(input: {
  fullName: string;
  email: string;
  phone: string;
  branchCode: string;
  salesTarget: number;
}): Promise<CreatedAgent> {
  const client = await sb();
  const { data, error } = await client.rpc("admin_create_agent", {
    p_full_name: input.fullName.trim(),
    p_email: input.email.trim(),
    p_phone: input.phone.trim() || null,
    p_branch_code: input.branchCode || null,
    p_sales_target: input.salesTarget || 0,
  });
  if (error) throw new Error(friendly(error));
  const row = (Array.isArray(data) ? data[0] : data) as
    | { agent_id: string; agent_code: string; email: string; temp_password: string }
    | undefined;
  if (!row) throw new Error("The agent was not created. Try again.");
  return { agentId: row.agent_id, code: row.agent_code, email: row.email, tempPassword: row.temp_password };
}

export async function resetAgentPassword(agentId: string): Promise<string> {
  const client = await sb();
  const { data, error } = await client.rpc("admin_reset_agent_password", { p_agent_id: agentId });
  if (error) throw new Error(friendly(error));
  return data as string;
}

export async function setAgentStatus(agentId: string, status: "active" | "suspended") {
  const client = await sb();
  const { error } = await client.rpc("admin_set_agent_status", { p_agent_id: agentId, p_status: status });
  if (error) throw new Error(friendly(error));
}

/** Agents who applied on the website (/agents/join), newest pending first. */
export async function listApplications(): Promise<Application[]> {
  const client = await sb();
  const { data, error } = await client.rpc("agent_applications_list");
  if (error) throw new Error(friendly(error));
  return (data ?? []) as Application[];
}

export type Decision = { status: "approved" | "declined"; texted: boolean; agent: { code: string; email: string; password: string } | null };

/** Approve (creates the login and texts it) or decline (texts a polite no). */
export async function decideApplication(input: {
  id: string;
  approve: boolean;
  licenseChecked?: boolean;
  branchCode?: string;
  reason?: string;
}): Promise<Decision> {
  let res: Response;
  try {
    res = await fetch("/api/admin/agent-applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("No connection. Reviewing applications needs internet.");
  }
  const json = (await res.json().catch(() => ({}))) as Partial<Decision> & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "That didn't work. Try again.");
  return json as Decision;
}
