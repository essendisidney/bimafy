"use client";

import { cn } from "@/components/ui";
import { setLang, useLang, type Lang } from "@/lib/lang";

export function LangToggle() {
  const lang = useLang();
  const options: { value: Lang; label: string }[] = [
    { value: "en", label: "EN" },
    { value: "sw", label: "SW" },
  ];
  return (
    <div className="flex rounded-xl border border-line bg-surface/70 p-0.5 text-xs" role="group" aria-label="Language / Lugha">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => setLang(o.value)}
          aria-pressed={lang === o.value}
          className={cn(
            "rounded-lg px-2.5 py-1.5 font-medium transition",
            lang === o.value ? "bg-teal text-on-accent" : "text-mute hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
