"use client";

import Link from "next/link";
import { BellRing, CheckCircle2, MessageCircle, Send, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePaymentsBook, useParticipants, usePoliciesBook } from "@/lib/data";
import { whatsappLink } from "@/lib/engines/agency";
import {
  eatDay,
  planPayments,
  planStatus,
  reminderQueue,
  type PlanHealth,
  type Reminder,
} from "@/lib/engines/reminders";
import { pushNotification } from "@/lib/events/ledger";
import { compactMoney, money } from "@/lib/format";
import { reminderMessage, reminderReason } from "@/lib/i18n/reminders";
import type { Lang } from "@/lib/lang";
import { markReminderSent, useReminderLog } from "@/lib/reminder-log";
import { Button, Card, Empty, PageHeader, Stat, Table, cn } from "@/components/ui";

const MANAGERS = new Set(["admin", "branch_manager", "call_center", "finance"]);

export default function RemindersPage() {
  const { user } = useAuth();
  const { policies } = usePoliciesBook();
  const { payments } = usePaymentsBook();
  const { participants } = useParticipants();
  const log = useReminderLog();
  const [today] = useState(() => eatDay(new Date()));
  const [lang, setLang] = useState<Lang>("en");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Agents work their own book; managers see the whole agency.
  const book = useMemo(
    () => (user && MANAGERS.has(user.role) ? policies : policies.filter((p) => p.agentId && p.agentId === user?.agentId)),
    [policies, user],
  );
  const phoneOf = useMemo(() => new Map(participants.map((p) => [p.id, p.phone])), [participants]);
  const sentKeys = useMemo(() => new Set(Object.keys(log)), [log]);
  const queue = useMemo(() => reminderQueue({ policies: book, payments, today, sent: sentKeys }), [book, payments, today, sentKeys]);
  const plans = useMemo(
    () =>
      book
        .filter((p) => p.instalmentPlan)
        .map((p) => ({
          policy: p,
          status: planStatus(
            p.instalmentPlan!,
            planPayments(p, payments).reduce((s, x) => s + x.amount, 0),
            today,
          ),
        }))
        .sort((a, b) => b.status.daysLate - a.status.daysLate),
    [book, payments, today],
  );

  const agentName = user?.name?.split(" ")[0] ?? "your agent";
  const text = (r: Reminder) => reminderMessage(lang, r, agentName);
  const phone = (r: Reminder) => phoneOf.get(r.policy.participantId);
  const sendable = queue.due.filter((r) => phone(r));
  const behind = plans.filter((p) => p.status.health === "behind" || p.status.health === "at_risk");
  const overdue = plans.reduce((s, p) => s + p.status.overdueAmount, 0);

  function record(r: Reminder, channel: "sms" | "whatsapp") {
    markReminderSent(r.key, channel);
    pushNotification({
      channel,
      title: `Reminder · ${r.policy.participantName}`,
      body: text(r),
      href: `/app/policies/${r.policy.id}`,
    });
  }

  async function sms(r: Reminder): Promise<string | null> {
    const res = await fetch("/api/reminders/sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone(r), message: text(r) }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; mode?: string };
    if (!res.ok) throw new Error(json.error ?? "SMS failed");
    record(r, "sms");
    return json.mode ?? null;
  }

  async function sendOne(r: Reminder) {
    setBusy(r.key);
    setNotice(null);
    try {
      const mode = await sms(r);
      setNotice({ tone: "ok", text: `SMS sent to ${r.policy.participantName}${mode === "simulated" ? " (test mode, no real SMS)" : ""}.` });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "SMS failed" });
    } finally {
      setBusy(null);
    }
  }

  async function sendAll() {
    setBusy("all");
    setNotice(null);
    let ok = 0;
    let mode: string | null = null;
    const failed: string[] = [];
    for (const r of sendable) {
      try {
        mode = await sms(r);
        ok++;
      } catch {
        failed.push(r.policy.participantName);
      }
    }
    setBusy(null);
    setNotice(
      failed.length
        ? { tone: "error", text: `Sent ${ok}. Couldn't send to ${failed.join(", ")} — check their numbers.` }
        : { tone: "ok", text: `Sent ${ok} reminder${ok === 1 ? "" : "s"}${mode === "simulated" ? " (test mode, no real SMS)" : ""}.` },
    );
  }

  function whatsapp(r: Reminder) {
    window.open(whatsappLink(phone(r)!, text(r)), "_blank", "noopener");
    record(r, "whatsapp");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Reminders"
        title="Who to message today"
        description="Renewal and instalment reminders worked out every morning, so no client lapses because nobody reminded them."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LangToggle value={lang} onChange={setLang} />
            <Button onClick={sendAll} disabled={!sendable.length || busy !== null}>
              <Send className="size-4" aria-hidden />
              {busy === "all" ? "Sending…" : `Send all by SMS (${sendable.length})`}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="To send today" value={String(queue.due.length)} hint={queue.due.length ? "Oldest debts first" : "All caught up"} />
        <Stat label="Sent today" value={String(queue.sent.length)} />
        <Stat label="Plans behind" value={String(behind.length)} hint={`${plans.length} on instalments`} />
        <Stat label="Instalments overdue" value={compactMoney(overdue)} />
      </div>

      {notice ? (
        <p
          role="status"
          className={cn(
            "mt-4 rounded-xl border px-4 py-3 text-sm",
            notice.tone === "ok" ? "border-teal/25 bg-teal/10 text-teal-ink" : "border-danger/25 bg-danger/10 text-danger",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      <section className="mt-6">
        <h2 className="font-display text-xl">Today</h2>
        {queue.due.length === 0 ? (
          <Card className="mt-3">
            <Empty
              icon={CheckCircle2}
              title={queue.sent.length ? "Everyone's been reminded" : "No reminders due today"}
              hint="Renewals get a message 30, 7 and 1 days before expiry; instalments 3 days before, on the day, and when late."
            />
          </Card>
        ) : (
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {queue.due.map((r) => (
              <ReminderCard
                key={r.key}
                r={r}
                today={today}
                message={text(r)}
                hasPhone={Boolean(phone(r))}
                busy={busy === r.key || busy === "all"}
                onSms={() => sendOne(r)}
                onWhatsapp={() => whatsapp(r)}
              />
            ))}
          </ul>
        )}
      </section>

      {queue.sent.length ? (
        <section className="mt-6">
          <h2 className="font-display text-xl">Already sent</h2>
          <ul className="mt-3 space-y-2">
            {queue.sent.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sand px-4 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{r.policy.participantName}</span>
                  <span className="text-mute"> · {reminderReason(r, today)}</span>
                </span>
                <span className="text-xs text-mute">
                  ✓ {log[r.key]?.channel === "whatsapp" ? "WhatsApp" : "SMS"} ·{" "}
                  {log[r.key] ? new Date(log[r.key].at).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-xl">Instalment plans</h2>
          <p className="mt-1 text-sm text-mute">Clients paying pole pole. Set one up from any policy page.</p>
          {plans.length === 0 ? (
            <Card className="mt-3">
              <Empty
                icon={Wallet}
                title="No instalment plans yet"
                hint="Open a policy and choose “Pay in instalments” to split the premium into M-Pesa payments."
                action={<Button href="/app/policies" variant="secondary">Open policies</Button>}
              />
            </Card>
          ) : (
            <ul className="mt-3 space-y-2">
              {plans.map(({ policy, status }) => (
                <li key={policy.id}>
                  <Link
                    href={`/app/policies/${policy.id}`}
                    className="block rounded-xl border border-line bg-surface px-4 py-3 transition hover:border-teal"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{policy.participantName}</span>
                      <HealthChip health={status.health} daysLate={status.daysLate} />
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand" aria-hidden>
                      <div className="h-full rounded-full bg-teal" style={{ width: `${Math.round((status.paid / status.total) * 100)}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-mute">
                      {money(status.paid)} of {money(status.total)} paid · {policy.number}
                      {status.next ? ` · next ${money(status.next.amount - status.next.paid)} on ${status.next.due}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-display text-xl">Coming up this week</h2>
          {queue.upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-mute">Nothing scheduled for the next 7 days.</p>
          ) : (
            <div className="mt-3">
              <Table headers={["Date", "Client", "Why"]}>
                {queue.upcoming.map((r) => (
                  <tr key={r.key} className="border-t border-line">
                    <td className="whitespace-nowrap px-3 py-2.5 text-mute">{r.sendOn}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/app/policies/${r.policy.id}`} className="font-medium hover:text-teal">
                        {r.policy.participantName}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-mute">{reminderReason(r, today)}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ReminderCard({
  r,
  today,
  message,
  hasPhone,
  busy,
  onSms,
  onWhatsapp,
}: {
  r: Reminder;
  today: string;
  message: string;
  hasPhone: boolean;
  busy: boolean;
  onSms: () => void;
  onWhatsapp: () => void;
}) {
  const urgent = r.kind === "instalment_final" || r.kind === "renewal_lapsed" || r.kind === "instalment_late";
  const soon = r.kind === "renewal_1" || r.kind === "instalment_today";
  return (
    <li>
      <Card className="flex h-full flex-col p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/app/policies/${r.policy.id}`} className="font-medium hover:text-teal">
              {r.policy.participantName}
            </Link>
            <p className="text-xs text-mute">
              {r.policy.number} · {r.policy.productName}
            </p>
          </div>
          <span
            className={cn(
              "whitespace-nowrap rounded-lg border px-2 py-0.5 text-xs",
              urgent
                ? "border-danger/25 bg-danger/10 text-danger"
                : soon
                  ? "border-gold/30 bg-gold/15 text-gold-ink"
                  : "border-teal/20 bg-teal/10 text-teal-ink",
            )}
          >
            {reminderReason(r, today)}
          </span>
        </div>
        <p className="mt-2 font-display text-2xl text-heading">{money(r.amount)}</p>
        <p className="mt-2 flex-1 rounded-xl bg-sand px-3 py-2 text-sm text-ink">{message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {hasPhone ? (
            <>
              <Button onClick={onSms} disabled={busy} className="px-3! py-1.5! text-xs!">
                <BellRing className="size-3.5" aria-hidden />
                {busy ? "Sending…" : "Send SMS"}
              </Button>
              <Button variant="secondary" onClick={onWhatsapp} className="px-3! py-1.5! text-xs!">
                <MessageCircle className="size-3.5" aria-hidden />
                WhatsApp
              </Button>
            </>
          ) : (
            <span className="self-center text-xs text-mute">No phone number on file</span>
          )}
          <Button
            variant="ghost"
            href={`/app/payments?policy=${encodeURIComponent(r.policy.id)}&amount=${Math.round(r.amount)}`}
            className="px-3! py-1.5! text-xs!"
          >
            <Wallet className="size-3.5" aria-hidden />
            Collect by M-Pesa
          </Button>
        </div>
      </Card>
    </li>
  );
}

function HealthChip({ health, daysLate }: { health: PlanHealth; daysLate: number }) {
  const [label, tone] = {
    complete: ["Fully paid", "border-teal/20 bg-teal/10 text-teal-ink"],
    on_track: ["On track", "border-teal/20 bg-teal/10 text-teal-ink"],
    behind: [`${daysLate} day${daysLate === 1 ? "" : "s"} late`, "border-gold/30 bg-gold/15 text-gold-ink"],
    at_risk: [`${daysLate} days late — cover at risk`, "border-danger/25 bg-danger/10 text-danger"],
  }[health];
  return <span className={cn("whitespace-nowrap rounded-lg border px-2 py-0.5 text-xs", tone)}>{label}</span>;
}

function LangToggle({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  return (
    <div role="group" aria-label="Message language" className="inline-flex rounded-xl border border-line bg-surface p-0.5 text-xs">
      {(["en", "sw"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={value === l}
          onClick={() => onChange(l)}
          className={cn("rounded-lg px-3 py-1.5 font-semibold", value === l ? "bg-teal text-on-accent" : "text-mute hover:text-ink")}
        >
          {l === "en" ? "English" : "Kiswahili"}
        </button>
      ))}
    </div>
  );
}
