import { cn } from "./ui";

/** The bimafy mark: a lowercase "b" on an emerald tile with the marigold dot. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--color-teal)" />
      <rect x="8.5" y="6.5" width="4.4" height="19" rx="2.2" fill="var(--color-on-accent)" />
      <circle cx="16.6" cy="19.2" r="5.1" fill="none" stroke="var(--color-on-accent)" strokeWidth="4.4" />
      <circle cx="24.2" cy="8.6" r="2.7" fill="var(--color-gold)" />
    </svg>
  );
}

/** Mark + wordmark. `tone="light"` for dark surfaces (sidebar, deep panels). */
export function Logo({
  className,
  markClassName,
  tone = "default",
  showWord = true,
}: {
  className?: string;
  markClassName?: string;
  tone?: "default" | "light";
  showWord?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={markClassName} />
      {showWord ? (
        <span className={cn("brand-mark leading-none", tone === "light" ? "text-white" : "text-heading")}>Bimafy</span>
      ) : (
        <span className="sr-only">Bimafy</span>
      )}
    </span>
  );
}
