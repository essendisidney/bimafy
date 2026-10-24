"use client";

import { useState } from "react";
import { APPLY_LINES, applicationProblem, type ApplicationInput } from "@/lib/agent-applications";
import { inputClass } from "@/components/ui";

const EMPTY: ApplicationInput = {
  name: "",
  phone: "",
  email: "",
  county: "",
  licenseNumber: "",
  yearsExperience: "",
  lines: [],
  message: "",
};

export function JoinForm() {
  const [form, setForm] = useState<ApplicationInput>(EMPTY);
  const [trap, setTrap] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof ApplicationInput) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (line: string) =>
    setForm((f) => ({ ...f, lines: f.lines.includes(line) ? f.lines.filter((l) => l !== line) : [...f.lines, line] }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = applicationProblem(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/public/agent-apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, company: trap }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Something went wrong — please try again.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error && !/fetch/i.test(err.message) ? err.message : "No connection — please try again.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="h-fit rounded-3xl border border-teal/25 bg-teal/10 p-6" role="status">
        <p className="font-display text-2xl text-heading">Asante, {form.name.trim().split(" ")[0]}!</p>
        <p className="mt-2 text-sm text-ink">
          Your application is in. We&apos;ll check your details and text you on {form.phone.trim()} within 2 working days —
          with your login if you&apos;re approved.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="h-fit space-y-3 rounded-3xl border border-line bg-surface p-6 shadow-soft">
      <h2 className="font-display text-2xl text-heading">Apply to join</h2>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Full name</span>
        <input className={inputClass} value={form.name} onChange={set("name")} autoComplete="name" maxLength={80} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Mobile number</span>
          <input className={inputClass} value={form.phone} onChange={set("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="07XX XXX XXX" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Email (your login)</span>
          <input className={inputClass} value={form.email} onChange={set("email")} type="email" autoComplete="email" maxLength={120} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm sm:col-span-1">
          <span className="mb-1 block font-medium">County</span>
          <input className={inputClass} value={form.county} onChange={set("county")} placeholder="e.g. Kiambu" maxLength={40} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">IRA licence no.</span>
          <input className={inputClass} value={form.licenseNumber} onChange={set("licenseNumber")} maxLength={40} placeholder="Optional" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Years selling</span>
          <input className={inputClass} value={form.yearsExperience} onChange={set("yearsExperience")} inputMode="numeric" maxLength={2} placeholder="0" />
        </label>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">What do you sell?</legend>
        <div className="flex flex-wrap gap-2">
          {APPLY_LINES.map(([value, label]) => {
            const on = form.lines.includes(value);
            return (
              <button
                key={value}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(value)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${on ? "border-teal bg-teal text-on-accent" : "border-line bg-paper text-ink hover:border-teal"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Anything else? (optional)</span>
        <textarea className={inputClass} rows={3} value={form.message} onChange={set("message")} maxLength={500} placeholder="Who you sell to, which insurers you work with…" />
      </label>
      {/* Hidden from people; bots fill it in. */}
      <input
        type="text"
        name="company"
        value={trap}
        onChange={(e) => setTrap(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      {error ? (
        <p role="alert" className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={sending}
        className="w-full rounded-xl bg-teal px-5 py-3 text-sm font-medium text-on-accent transition hover:bg-mint disabled:opacity-60"
      >
        {sending ? "Sending…" : "Send my application"}
      </button>
      <p className="text-xs text-mute">We&apos;ll text you on this number.</p>
    </form>
  );
}
