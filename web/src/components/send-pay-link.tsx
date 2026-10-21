"use client";

import { Copy, Link2, MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { whatsappLink } from "@/lib/engines/agency";
import { money } from "@/lib/format";
import type { Lang } from "@/lib/lang";
import { DEMO_TOKEN, payLinkMessage } from "@/lib/pay-links";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Policy } from "@/lib/types";
import { Button, cn } from "@/components/ui";

/**
 * Create an M-Pesa pay link for a policy and send it to the client. The
 * database fixes the amount, records the payment and activates the policy
 * when M-Pesa confirms (migration 00016), so nobody has to be online.
 */
export function SendPayLink({
  policy,
  amount,
  purpose = "premium",
  note,
  phone,
  lang = "en",
  className,
  compact,
}: {
  policy: Pick<Policy, "id" | "number" | "participantName" | "productName">;
  amount: number;
  purpose?: "premium" | "instalment" | "renewal";
  note?: string;
  phone?: string;
  lang?: Lang;
  className?: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const size = compact ? "px-3! py-1.5! text-xs!" : "";

  const text = (link: string) =>
    payLinkMessage(lang, {
      first: policy.participantName.split(" ")[0],
      amount: `KES ${Math.round(amount).toLocaleString("en-KE")}`,
      product: policy.productName,
      number: policy.number,
      url: link,
      agent: user?.name?.split(" ")[0] ?? "Bimafy",
    });

  async function create() {
    setBusy(true);
    setError(null);
    try {
      let token = DEMO_TOKEN;
      if (isSupabaseConfigured()) {
        const { data, error: err } = await createClient().rpc("pay_link_create", {
          p_policy_id: policy.id,
          p_amount: Math.round(amount),
          p_purpose: purpose,
          p_note: note ?? null,
        });
        if (err) throw new Error(err.message);
        token = data as string;
      }
      setUrl(`${window.location.origin}/pay/${token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the link");
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

  if (!url) {
    return (
      <span className={cn("inline-flex flex-col gap-1", className)}>
        <Button variant="secondary" onClick={create} disabled={busy || amount < 1} className={size}>
          <Link2 className="size-3.5" aria-hidden />
          {busy ? "Creating…" : `Send pay link · ${money(Math.round(amount))}`}
        </Button>
        {error ? <span className="text-xs text-danger">{error}</span> : null}
      </span>
    );
  }

  return (
    <div className={cn("w-full rounded-xl border border-teal/25 bg-teal/5 p-3", className)}>
      <p className="text-xs text-mute">Pay link for {money(Math.round(amount))} · valid 14 days</p>
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
