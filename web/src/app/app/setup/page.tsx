"use client";

import Link from "next/link";
import { CheckCircle2, Circle, CircleAlert, CircleDashed, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { readiness, type Check, type CheckState } from "@/lib/go-live";
import { Button, Card, PageHeader, cn, inputClass } from "@/components/ui";

const ICON: Record<CheckState, { Icon: typeof Circle; tone: string; label: string }> = {
  done: { Icon: CheckCircle2, tone: "text-teal", label: "Done" },
  todo: { Icon: Circle, tone: "text-gold-ink", label: "To do" },
  warn: { Icon: CircleAlert, tone: "text-danger", label: "Needs attention" },
  optional: { Icon: CircleDashed, tone: "text-mute", label: "Optional" },
};

export default function GoLivePage() {
  const { user } = useAuth();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/setup", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { checks?: Check[]; adminPhone?: string | null; error?: string };
    if (!res.ok || !json.checks) return setError(json.error ?? "Couldn't load the checklist");
    setChecks(json.checks);
    if (json.adminPhone) setPhone((p) => p || json.adminPhone!);
  }, []);

  useEffect(() => {
    // Loading the checklist is an external fetch, so it starts from an effect.
    void load();
  }, [load]);

  async function act(check: Check) {
    if (!check.action) return;
    setBusy(check.id);
    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: check.action.kind, phone }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; mode?: string };
      if (!res.ok) throw new Error(json.error ?? "That didn't work");
      setNotes((n) => ({
        ...n,
        [check.id]: {
          ok: true,
          text: check.action!.kind === "test_sms" ? (json.mode === "simulated" ? "Simulated — no SMS provider yet." : "Sent — check your phone.") : "Connected.",
        },
      }));
      await load();
    } catch (err) {
      setNotes((n) => ({ ...n, [check.id]: { ok: false, text: (err as Error).message } }));
    } finally {
      setBusy(null);
    }
  }

  if (user && user.role !== "admin") {
    return <Card className="p-6 text-sm text-mute">Only admins can see the go-live checklist.</Card>;
  }

  const score = checks ? readiness(checks) : null;

  return (
    <div>
      <PageHeader
        eyebrow="Go live"
        title={score ? (score.done === score.total ? "Bimafy is fully live" : `${score.done} of ${score.total} ready`) : "Go-live checklist"}
        description="What's connected, what isn't, and exactly what to do about it. Secrets never leave the server — this page only checks them."
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw className="size-4" aria-hidden />
            Check again
          </Button>
        }
      />
      {score ? (
        <div className="mb-5 h-2 overflow-hidden rounded-full bg-sand" aria-hidden>
          <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${(score.done / Math.max(1, score.total)) * 100}%` }} />
        </div>
      ) : null}
      {error ? <Card className="p-5 text-sm text-danger">{error}</Card> : null}
      {!checks && !error ? <div className="h-64 animate-pulse rounded-2xl bg-sand" /> : null}
      <ul className="space-y-3">
        {checks?.map((c) => {
          const { Icon, tone, label } = ICON[c.state];
          const note = notes[c.id];
          return (
            <li key={c.id}>
              <Card className="p-5">
                <div className="flex items-start gap-3">
                  <Icon className={cn("mt-0.5 size-5 shrink-0", tone)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-display text-lg text-heading">{c.title}</h2>
                      <span className={cn("text-xs font-medium", tone)}>{label}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink">{c.detail}</p>
                    {c.fix && c.state !== "done" ? (
                      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-mute">
                        {c.fix.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ol>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {c.action?.kind === "test_sms" ? (
                        <input
                          className={cn(inputClass, "w-44")}
                          type="tel"
                          inputMode="tel"
                          placeholder="Your 07XX number"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          aria-label="Your phone number for the test SMS"
                        />
                      ) : null}
                      {c.action ? (
                        <Button onClick={() => act(c)} disabled={busy === c.id} className="px-3! py-1.5! text-sm!">
                          {busy === c.id ? "Working…" : c.action.label}
                        </Button>
                      ) : null}
                      {c.link ? (
                        <Link href={c.link.href} className="text-sm text-teal hover:underline">
                          {c.link.label} →
                        </Link>
                      ) : null}
                    </div>
                    {note ? <p className={cn("mt-2 text-sm", note.ok ? "text-teal-ink" : "text-danger")}>{note.text}</p> : null}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
