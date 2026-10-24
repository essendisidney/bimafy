"use client";

import { BadgeCheck, Check, Copy, Inbox, KeyRound, MessageCircle, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { whatsappLink } from "@/lib/engines/agency";
import { lineLabel, type Application } from "@/lib/agent-applications";
import { inviteMessage, newAgentProblem, type NewAgentInput } from "@/lib/invite";
import { agents as demoAgents } from "@/lib/seed";
import {
  canManageAgents,
  createAgent,
  decideApplication,
  listApplications,
  listBranches,
  listTeam,
  resetAgentPassword,
  setAgentStatus,
  type Branch,
  type TeamAgent,
} from "@/lib/team";
import { Badge, Button, Card, Field, PageHeader, SkeletonRows, Table, inputClass } from "@/components/ui";

const EMPTY: NewAgentInput = { fullName: "", email: "", phone: "", branchCode: "", salesTarget: "" };

/** What the admin needs to hand to the agent right now (the password is never shown again). */
type Handover = { name: string; email: string; phone: string; password: string; code?: string; reset?: boolean; texted?: boolean };

export default function TeamPage() {
  const { user, operatorId } = useAuth();
  const manage = canManageAgents(user);

  return (
    <div>
      <PageHeader
        eyebrow="Team"
        title="Agents"
        description="Approve agents who applied on the website, add agents yourself, reset passwords and switch access off — no IT needed."
      />
      {manage && operatorId ? <ManageTeam operatorId={operatorId} /> : <DemoTeam />}
    </div>
  );
}

function ManageTeam({ operatorId }: { operatorId: string }) {
  const [team, setTeam] = useState<TeamAgent[] | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [handover, setHandover] = useState<Handover | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTeam(operatorId), listBranches(operatorId), listApplications().catch(() => [] as Application[])])
      .then(([t, b, apps]) => {
        if (cancelled) return;
        setTeam(t);
        setBranches(b);
        setApplications(apps);
        setLoadError(null);
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [operatorId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const pending = applications.filter((a) => a.status === "pending");

  return (
    <div className="space-y-4">
      {pending.length ? (
        <ApplicationsCard
          applications={pending}
          branches={branches}
          onApproved={(h) => {
            setHandover(h);
            reload();
          }}
          onDeclined={reload}
        />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          {handover ? <HandoverCard handover={handover} onDone={() => setHandover(null)} /> : null}
          <AddAgentCard
            branches={branches}
            onCreated={(h) => {
              setHandover(h);
              reload();
            }}
          />
        </div>
        <Card className="p-2">
          <div className="flex items-baseline justify-between px-3 pt-3">
            <h2 className="font-display text-xl text-heading">Your agents</h2>
            {team ? <p className="text-xs text-mute">{team.length} total</p> : null}
          </div>
          {loadError ? <p className="px-3 py-4 text-sm text-danger">{loadError}</p> : null}
          {!team && !loadError ? <SkeletonRows rows={4} /> : null}
          {team && team.length === 0 ? (
            <p className="px-3 py-6 text-sm text-mute">No agents yet. Add your first one on the left.</p>
          ) : null}
          {team && team.length > 0 ? (
            <Table headers={["Agent", "Branch", "Status", ""]}>
              {team.map((a) => (
                <AgentRow key={a.id} agent={a} onHandover={setHandover} onChanged={reload} />
              ))}
            </Table>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

/** Agents who applied at /agents/join. Approving creates their login and texts it to them. */
function ApplicationsCard({
  applications,
  branches,
  onApproved,
  onDeclined,
}: {
  applications: Application[];
  branches: Branch[];
  onApproved: (h: Handover) => void;
  onDeclined: () => void;
}) {
  return (
    <Card className="border-gold/50 p-5">
      <h2 className="flex items-center gap-2 font-display text-xl text-heading">
        <Inbox className="h-5 w-5 text-gold-ink" aria-hidden /> {applications.length} agent application{applications.length === 1 ? "" : "s"} waiting
      </h2>
      <p className="mt-1 text-sm text-mute">
        From your website&apos;s &ldquo;Become an agent&rdquo; page. Check their IRA licence on the{" "}
        <a href="https://www.ira.go.ke" target="_blank" rel="noopener noreferrer" className="text-teal-ink underline">
          IRA website
        </a>{" "}
        before ticking it as checked.
      </p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {applications.map((a) => (
          <ApplicationItem key={a.id} app={a} branches={branches} onApproved={onApproved} onDeclined={onDeclined} />
        ))}
      </ul>
    </Card>
  );
}

function ApplicationItem({
  app,
  branches,
  onApproved,
  onDeclined,
}: {
  app: Application;
  branches: Branch[];
  onApproved: (h: Handover) => void;
  onDeclined: () => void;
}) {
  const [branchCode, setBranchCode] = useState("");
  const [licenseChecked, setLicenseChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const local = app.phone.startsWith("254") ? `0${app.phone.slice(3)}` : app.phone;

  async function decide(approve: boolean) {
    let reason: string | undefined;
    if (!approve) {
      const answer = window.prompt(`Decline ${app.name}? Optional reason (it's included in the SMS to them):`, "");
      if (answer === null) return;
      reason = answer;
    }
    setBusy(true);
    setError(null);
    try {
      const d = await decideApplication({ id: app.id, approve, licenseChecked, branchCode, reason });
      if (d.status === "approved" && d.agent) {
        onApproved({ name: app.name, email: d.agent.email, phone: app.phone, password: d.agent.password, code: d.agent.code, texted: d.texted });
      } else {
        onDeclined();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-heading">{app.name}</p>
          <p className="truncate text-xs text-mute">
            {local} · {app.email}
          </p>
        </div>
        <p className="shrink-0 text-xs text-mute">{new Date(app.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</p>
      </div>
      <dl className="mt-2 space-y-0.5 text-xs">
        <div className="flex gap-2">
          <dt className="text-mute">Sells</dt>
          <dd>{app.lines.map(lineLabel).join(", ") || "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-mute">Where</dt>
          <dd>
            {app.county ?? "—"}
            {app.years_experience != null ? ` · ${app.years_experience} yr${app.years_experience === 1 ? "" : "s"} selling` : ""}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-mute">IRA licence</dt>
          <dd className="font-mono">{app.license_number ?? "not given"}</dd>
        </div>
      </dl>
      {app.message ? <p className="mt-2 rounded-xl bg-sand px-3 py-2 text-xs text-ink">&ldquo;{app.message}&rdquo;</p> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select className={inputClass} value={branchCode} onChange={(e) => setBranchCode(e.target.value)} aria-label="Branch">
          <option value="">Head office</option>
          {branches.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>
        {app.license_number ? (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={licenseChecked} onChange={(e) => setLicenseChecked(e.target.checked)} />
            <BadgeCheck className="h-3.5 w-3.5 text-teal-ink" aria-hidden /> I checked this licence
          </label>
        ) : null}
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-danger">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
          {busy ? "Saving…" : "Approve & text login"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => decide(false)}>
          Decline
        </Button>
      </div>
    </li>
  );
}

function AddAgentCard({ branches, onCreated }: { branches: Branch[]; onCreated: (h: Handover) => void }) {
  const [form, setForm] = useState<NewAgentInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof NewAgentInput) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card className="p-5">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const problem = newAgentProblem(form);
          if (problem) {
            setError(problem);
            return;
          }
          setBusy(true);
          setError(null);
          try {
            const created = await createAgent({
              fullName: form.fullName,
              email: form.email,
              phone: form.phone,
              branchCode: form.branchCode,
              salesTarget: Number(form.salesTarget.replace(/[,\s]/g, "")) || 0,
            });
            onCreated({ name: form.fullName.trim(), email: created.email, phone: form.phone, password: created.tempPassword, code: created.code });
            setForm(EMPTY);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not add the agent.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="flex items-center gap-2 font-display text-xl text-heading">
          <UserPlus className="h-5 w-5 text-teal-ink" aria-hidden /> Add an agent
        </h2>
        <Field label="Full name">
          <input className={inputClass} value={form.fullName} onChange={set("fullName")} autoComplete="off" />
        </Field>
        <Field label="Email (their login)">
          <input className={inputClass} type="email" value={form.email} onChange={set("email")} autoComplete="off" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone (for WhatsApp)">
            <input className={inputClass} inputMode="tel" placeholder="0712 345 678" value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Branch">
            <select className={inputClass} value={form.branchCode} onChange={set("branchCode")}>
              <option value="">Head office</option>
              {branches.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Yearly sales target (KES, optional)">
          <input className={inputClass} inputMode="numeric" value={form.salesTarget} onChange={set("salesTarget")} />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Adding…" : "Add agent and create login"}
        </Button>
        <p className="text-xs text-mute">
          You&apos;ll get a one-time password to send them. They choose their own password the first time they sign in.
        </p>
      </form>
    </Card>
  );
}

function HandoverCard({ handover, onDone }: { handover: Handover; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const message = () =>
    inviteMessage({ ...handover, url: `${window.location.origin}/login` });

  return (
    <Card className="border-teal/40 bg-teal/5 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-ink">
        {handover.reset ? "New one-time password" : "Agent added"}
      </p>
      <h2 className="mt-1 font-display text-xl text-heading">
        Send {handover.name.split(" ")[0]} their login now
      </h2>
      <dl className="mt-3 space-y-1 text-sm">
        {handover.code ? (
          <div className="flex justify-between gap-3">
            <dt className="text-mute">Agent code</dt>
            <dd className="font-medium">{handover.code}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="text-mute">Email</dt>
          <dd className="font-medium">{handover.email}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-mute">One-time password</dt>
          <dd className="font-mono font-semibold text-heading">{handover.password}</dd>
        </div>
      </dl>
      {handover.texted ? (
        <p className="mt-3 text-xs text-teal-ink">We texted this login to {handover.name.split(" ")[0]}. Send it on WhatsApp too if they don&apos;t get the SMS.</p>
      ) : (
        <p className="mt-3 text-xs text-gold-ink">This password is shown only once. Send it before you close this card.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {handover.phone ? (
          <button
            onClick={() => window.open(whatsappLink(handover.phone, message()), "_blank", "noopener")}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1c8247] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <MessageCircle className="h-4 w-4" aria-hidden /> Send on WhatsApp
          </button>
        ) : null}
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message());
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Copied" : "Copy message"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </Card>
  );
}

function AgentRow({
  agent,
  onHandover,
  onChanged,
}: {
  agent: TeamAgent;
  onHandover: (h: Handover) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suspended = agent.status === "suspended";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-line/70 align-top">
      <td className="px-3 py-3">
        <p className="font-medium text-heading">{agent.name}</p>
        <p className="text-xs text-mute">
          {agent.code} · {agent.email || "no login"}
          {agent.phone ? ` · ${agent.phone}` : ""}
        </p>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </td>
      <td className="px-3 py-3 text-sm">{agent.branch}</td>
      <td className="px-3 py-3">
        <Badge status={suspended ? "suspended" : "active"} label={suspended ? "Access off" : "Active"} />
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col items-end gap-1.5">
          {agent.hasLogin ? (
            <Button
              variant="secondary"
              className="whitespace-nowrap px-3! py-1.5! text-xs!"
              disabled={busy || suspended}
              onClick={() =>
                run(async () => {
                  if (!window.confirm(`Give ${agent.name} a new one-time password? Their current password stops working.`)) return;
                  const password = await resetAgentPassword(agent.id);
                  onHandover({ name: agent.name, email: agent.email, phone: agent.phone, password, reset: true });
                })
              }
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden /> Reset password
            </Button>
          ) : null}
          <Button
            variant={suspended ? "secondary" : "ghost"}
            className="whitespace-nowrap px-3! py-1.5! text-xs!"
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (!suspended && !window.confirm(`Switch off ${agent.name}'s access? They won't be able to sign in. Their leads and history stay.`)) return;
                await setAgentStatus(agent.id, suspended ? "active" : "suspended");
                onChanged();
              })
            }
          >
            {suspended ? "Turn access on" : "Turn access off"}
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** Demo personas can see the page but changes need a real admin account. */
function DemoTeam() {
  return (
    <div className="space-y-4">
      <Card className="border-gold/50 bg-gold/10 p-5 text-sm">
        <p className="font-semibold text-heading">You&apos;re looking at demo data.</p>
        <p className="mt-1 text-mute">
          Sign in with a real admin or branch manager account to add agents, send logins and reset passwords.
        </p>
      </Card>
      <Card className="p-2">
        <Table headers={["Agent", "Branch", "Status"]}>
          {demoAgents.map((a) => (
            <tr key={a.id} className="border-b border-line/70">
              <td className="px-3 py-3">
                <p className="font-medium text-heading">{a.name}</p>
                <p className="text-xs text-mute">
                  {a.code} · {a.phone}
                </p>
              </td>
              <td className="px-3 py-3 text-sm">{a.branch}</td>
              <td className="px-3 py-3">
                <Badge status="active" label="Active" />
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
