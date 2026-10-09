import Link from "next/link";
import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { prettyStatus, statusTone } from "@/lib/format";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  children,
  href,
  onClick,
  variant = "primary",
  type = "button",
  className,
  disabled,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  type?: "button" | "submit";
  className?: string;
  disabled?: boolean;
}) {
  const styles = {
    primary: "bg-teal text-on-accent hover:bg-mint",
    secondary: "bg-surface text-ink border border-line hover:border-teal hover:text-teal",
    ghost: "bg-transparent text-ink hover:bg-sand",
    danger: "bg-danger text-on-accent hover:opacity-90",
  }[variant];
  const cls = cn(
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition active:scale-[0.98]",
    styles,
    disabled && "pointer-events-none opacity-50",
    className,
  );
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button type={type} onClick={onClick} className={cls} disabled={disabled}>
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-line bg-surface shadow-soft", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-teal">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-3xl text-heading md:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mute">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-mute">{label}</p>
      <p className="mt-2 font-display text-3xl text-heading">{value}</p>
      {hint ? <p className="mt-1 text-xs text-mute">{hint}</p> : null}
    </Card>
  );
}

export function Badge({ status, label }: { status: string; label?: string }) {
  const tone = statusTone(status);
  const tones = {
    ok: "bg-teal/10 text-teal-ink border-teal/20",
    warn: "bg-gold/15 text-gold-ink border-gold/30",
    danger: "bg-danger/10 text-danger border-danger/25",
    muted: "bg-sand text-mute border-line",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex rounded-lg border px-2.5 py-0.5 text-xs",
        !label && "capitalize",
        tones[tone as keyof typeof tones],
      )}
    >
      {label ?? prettyStatus(status)}
    </span>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none ring-teal/25 focus:border-teal focus:ring-2";

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-[0.14em] text-mute">
            {headers.map((h) => (
              <th key={h} className="px-3 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({
  title,
  hint,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  hint?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center text-sm text-mute">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-2xl border border-line bg-sand/60 text-mute">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="font-medium text-ink">{title}</p>
      {hint ? <p className="mt-1 max-w-sm">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Shimmering placeholder block; size it with className. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-lg", className)} />;
}

/** Placeholder for a loading table or list. */
export function SkeletonRows({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-3/5 opacity-70" />
          </div>
          <Skeleton className="hidden h-6 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a loading record page (header + facts card). */
export function DetailSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-9 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="space-y-4 p-6">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="grid grid-cols-2 gap-6">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ))}
        </Card>
        <Card className="space-y-3 p-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-16" />
          <Skeleton className="h-4 w-3/4" />
        </Card>
      </div>
    </div>
  );
}
