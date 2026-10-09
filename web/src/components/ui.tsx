import Link from "next/link";
import type { ReactNode } from "react";
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
    primary: "bg-teal text-white hover:bg-mint",
    secondary: "bg-white text-ink border border-line hover:border-teal hover:text-teal",
    ghost: "bg-transparent text-ink hover:bg-sand",
    danger: "bg-danger text-white hover:opacity-90",
  }[variant];
  const cls = cn(
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition",
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
        <h1 className="font-display text-3xl text-forest md:text-4xl">{title}</h1>
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
      <p className="mt-2 font-display text-3xl text-forest">{value}</p>
      {hint ? <p className="mt-1 text-xs text-mute">{hint}</p> : null}
    </Card>
  );
}

export function Badge({ status, label }: { status: string; label?: string }) {
  const tone = statusTone(status);
  const tones = {
    ok: "bg-teal/10 text-teal border-teal/20",
    warn: "bg-gold/15 text-[#8a6d12] border-gold/30",
    danger: "bg-rose-50 text-rose-800 border-rose-200",
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
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none ring-teal/25 focus:border-teal focus:ring-2";

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

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-10 text-center text-sm text-mute">
      <p className="font-medium text-ink">{title}</p>
      {hint ? <p className="mt-1">{hint}</p> : null}
    </div>
  );
}
