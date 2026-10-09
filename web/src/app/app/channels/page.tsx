"use client";

import { useMemo, useState } from "react";
import { applyChannelEffects } from "@/lib/channels/apply_effects";
import { handleUssd } from "@/lib/channels/ussd";
import { replyWhatsApp, type WhatsAppMessage } from "@/lib/channels/whatsapp";
import { Badge, Button, Card, Field, PageHeader, inputClass } from "@/components/ui";

export default function ChannelsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Channels"
        title="WhatsApp and USSD"
        description="Africa-first distribution. Simulate *384*90# and WhatsApp care, with webhooks ready for Africa's Talking and Meta."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <UssdSimulator />
        <WhatsAppSimulator />
      </div>
      <Card className="mt-4 space-y-2 p-5 text-sm text-mute">
        <p className="font-medium text-heading">Production webhooks</p>
        <p>
          USSD: <code className="text-ink">POST /api/channels/ussd</code> (Africa&apos;s Talking CON/END)
        </p>
        <p>
          WhatsApp: <code className="text-ink">POST /api/channels/whatsapp</code> and Meta verify via{" "}
          <code className="text-ink">WHATSAPP_VERIFY_TOKEN</code>
        </p>
      </Card>
    </div>
  );
}

function UssdSimulator() {
  const [phone, setPhone] = useState("254714444555");
  const [sessionId] = useState(() => `ussd-${Date.now()}`);
  const [path, setPath] = useState("");
  const [screen, setScreen] = useState("Dial *384*90# to begin");
  const [ended, setEnded] = useState(false);
  const [input, setInput] = useState("");
  const [log, setLog] = useState<string[]>([]);

  function run(nextText: string) {
    const result = handleUssd({
      sessionId,
      phoneNumber: phone,
      text: nextText,
      serviceCode: "*384*90#",
    });
    applyChannelEffects(result.effects);
    setPath(nextText);
    setScreen(result.message);
    setEnded(result.type === "END");
    setLog((prev) => [`${result.type}: ${nextText || "(start)"}`, ...prev].slice(0, 8));
    setInput("");
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line bg-forest px-5 py-4 text-champagne">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold">USSD</p>
        <p className="mt-1 font-display text-2xl text-white">*384*90#</p>
      </div>
      <div className="space-y-4 p-5">
        <Field label="MSISDN">
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <div className="theme-light mx-auto w-full max-w-xs rounded-[1.5rem] border border-line bg-ink p-3 shadow-lift">
          <div className="rounded-xl bg-[#c5d4a1] px-3 py-4 font-mono text-xs leading-relaxed text-ink whitespace-pre-wrap min-h-40">
            {screen}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              className="w-full rounded-lg border-0 bg-white/10 px-3 py-2 text-sm text-champagne outline-none"
              placeholder={ended ? "Session ended" : "Reply 1, 2..."}
              value={input}
              disabled={ended}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !ended) {
                  const next = path ? `${path}*${input.trim()}` : input.trim();
                  run(next);
                }
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setEnded(false);
              run("");
            }}
          >
            Dial *384*90#
          </Button>
          <Button
            variant="secondary"
            disabled={ended || !input.trim()}
            onClick={() => {
              const next = path ? `${path}*${input.trim()}` : input.trim();
              run(next);
            }}
          >
            Send
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setPath("");
              setEnded(false);
              setScreen("Dial *384*90# to begin");
              setLog([]);
            }}
          >
            Reset
          </Button>
        </div>
        {log.length ? (
          <div className="space-y-1 text-xs text-mute">
            {log.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function WhatsAppSimulator() {
  const [draft, setDraft] = useState("balance");
  const [handoff, setHandoff] = useState(false);
  const [messages, setMessages] = useState<WhatsAppMessage[]>(() => [
    {
      id: "m0",
      from: "bot",
      text: "Karibu InsuraX Care. Type HELP for options.",
      at: new Date().toISOString(),
    },
  ]);

  const quick = useMemo(() => ["HELP", "BALANCE", "PAY", "CLAIM", "CERTIFICATE", "AGENT"], []);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const customer: WhatsAppMessage = {
      id: `c-${Date.now()}`,
      from: "customer",
      text: trimmed,
      at: new Date().toISOString(),
    };
    const result = replyWhatsApp(trimmed, "+254714444555");
    applyChannelEffects(result.effects);
    const botMessages: WhatsAppMessage[] = result.replies.map((t, i) => ({
      id: `b-${Date.now()}-${i}`,
      from: result.handoff ? "agent" : "bot",
      text: t,
      at: new Date().toISOString(),
    }));
    setMessages((prev) => [...prev, customer, ...botMessages]);
    setHandoff(Boolean(result.handoff));
    setDraft("");
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line bg-[#075e54] px-5 py-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/70">WhatsApp</p>
            <p className="mt-1 font-display text-2xl">InsuraX Care</p>
          </div>
          {handoff ? <Badge status="pending" /> : <Badge status="active" />}
        </div>
      </div>
      <div className="theme-light flex h-[420px] flex-col bg-[#ece5dd]">
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm shadow-sm ${
                m.from === "customer"
                  ? "ml-auto bg-[#dcf8c6] text-ink"
                  : m.from === "agent"
                    ? "bg-surface text-ink ring-1 ring-gold/40"
                    : "bg-surface text-ink"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wide text-mute">
                {m.from === "customer" ? "Customer" : m.from === "agent" ? "Agent" : "Bot"}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">{m.text}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-line bg-surface p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                className="rounded-lg border border-line px-2 py-1 text-[11px] text-mute hover:border-teal hover:text-teal"
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send(draft);
              }}
              placeholder="Type a message"
            />
            <Button onClick={() => send(draft)}>Send</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
