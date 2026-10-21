"use client";

import { Copy, MessageCircle, Send, Star } from "lucide-react";
import { useState } from "react";
import { whatsappLink } from "@/lib/engines/agency";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Policy } from "@/lib/types";
import { Button, cn } from "@/components/ui";

/** Ask a client for a one-time review of the agent on their policy. */
export function RequestReview({
  policy,
  phone,
  className,
}: {
  policy: Pick<Policy, "id" | "participantName" | "agentName">;
  phone?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const agent = policy.agentName?.split(" ")[0] ?? "your agent";
  const text = (link: string) =>
    `Hi ${policy.participantName.split(" ")[0]}, thank you for choosing Bimafy. How was ${agent}? Please rate them here (1 minute): ${link}`;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      let token = "demo";
      if (isSupabaseConfigured()) {
        const { data, error: err } = await createClient().rpc("review_invite_create", { p_policy_id: policy.id });
        if (err) throw new Error(err.message);
        token = data as string;
      }
      setUrl(`${window.location.origin}/review/${token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the review link");
    } finally {
      setBusy(false);
    }
  }

  async function sms() {
    if (!url || !phone) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reminders/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: text(url) }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; mode?: string };
      if (!res.ok) throw new Error(json.error ?? "SMS failed");
      setDone(json.mode === "simulated" ? "SMS sent (test mode)" : "SMS sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "SMS failed");
    } finally {
      setBusy(false);
    }
  }

  if (!policy.agentName) return null;
  if (!url) {
    return (
      <span className={cn("inline-flex flex-col gap-1", className)}>
        <Button variant="ghost" onClick={create} disabled={busy}>
          <Star className="size-4" aria-hidden />
          {busy ? "Creating…" : "Ask for a review"}
        </Button>
        {error ? <span className="text-xs text-danger">{error}</span> : null}
      </span>
    );
  }
  return (
    <div className={cn("w-full rounded-xl border border-gold/30 bg-gold/10 p-3", className)}>
      <p className="text-xs text-mute">One-time review link for {policy.participantName} · valid 60 days</p>
      <p className="mt-1 break-all font-mono text-xs text-ink">{url}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {phone ? (
          <Button onClick={sms} disabled={busy} className="px-3! py-1.5! text-xs!">
            <Send className="size-3.5" aria-hidden />
            {busy ? "Sending…" : "Text it"}
          </Button>
        ) : null}
        {phone ? (
          <Button
            variant="secondary"
            className="px-3! py-1.5! text-xs!"
            onClick={() => {
              window.open(whatsappLink(phone, text(url)), "_blank", "noopener");
              setDone("Opened in WhatsApp");
            }}
          >
            <MessageCircle className="size-3.5" aria-hidden />
            WhatsApp
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="px-3! py-1.5! text-xs!"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text(url));
              setDone("Copied");
            } catch {
              setError("Couldn't copy — select the link above");
            }
          }}
        >
          <Copy className="size-3.5" aria-hidden />
          Copy message
        </Button>
      </div>
      {done ? <p className="mt-2 text-xs text-teal-ink">✓ {done}</p> : null}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
