"use client";

import { ExternalLink, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Button, Card, Field, cn, inputClass } from "@/components/ui";

type Profile = { slug: string; bio: string | null; languages: string[]; counties: string[]; is_public: boolean; name: string };

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** An agent's own public page on /agents: what customers see, and whether they see it at all. */
export function AgentPublicProfile() {
  const live = isSupabaseConfigured();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bio, setBio] = useState("");
  const [languages, setLanguages] = useState("English, Kiswahili");
  const [counties, setCounties] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "none">(live ? "loading" : "ready");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    createClient()
      .rpc("my_agent_profile")
      .then(({ data }: { data: Profile | null }) => {
        if (cancelled) return;
        if (!data) return setState("none");
        setProfile(data);
        setBio(data.bio ?? "");
        setLanguages(data.languages.join(", "));
        setCounties(data.counties.join(", "));
        setIsPublic(data.is_public);
        setState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [live]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      if (!live) {
        setMsg({ ok: true, text: "Saved on this device (demo mode — connect the database to publish)." });
        return;
      }
      const { data, error } = await createClient().rpc("agent_profile_update", {
        p_bio: bio,
        p_languages: list(languages),
        p_counties: list(counties),
        p_is_public: isPublic,
      });
      if (error) throw new Error(error.message);
      setProfile(data as Profile);
      setMsg({ ok: true, text: isPublic ? "Saved — your profile is live." : "Saved. Your profile is hidden from customers." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't save" });
    } finally {
      setSaving(false);
    }
  }

  if (state === "none") return null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl">
            <Globe className="size-5 text-teal" aria-hidden />
            Your public profile
          </h2>
          <p className="mt-1 text-sm text-mute">
            Customers find you on Bimafy&apos;s agent directory, read your reviews and ask you for a quote directly.
          </p>
        </div>
        {profile?.is_public ? (
          <a
            href={`/agents/${profile.slug}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-sm hover:border-teal"
          >
            View my page
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </div>

      {state === "loading" ? (
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-sand" />
      ) : (
        <div className="mt-4 space-y-3">
          <Field label="About you (what customers read first)">
            <textarea
              className={cn(inputClass, "min-h-24")}
              maxLength={400}
              value={bio}
              placeholder="E.g. I help families and boda riders in Kisumu get cover they can afford, and I answer on WhatsApp."
              onChange={(e) => setBio(e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Languages (comma separated)">
              <input className={inputClass} value={languages} onChange={(e) => setLanguages(e.target.value)} />
            </Field>
            <Field label="Counties you serve (comma separated)">
              <input className={inputClass} value={counties} placeholder="Kisumu, Siaya" onChange={(e) => setCounties(e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--color-teal)]" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            <span>
              <span className="font-medium">Show me in the agent directory</span>
              <span className="block text-xs text-mute">Your phone number is never shown; customers request a call through Bimafy.</span>
            </span>
          </label>
          {msg ? <p className={cn("text-sm", msg.ok ? "text-teal-ink" : "text-danger")}>{msg.text}</p> : null}
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </div>
      )}
    </Card>
  );
}
