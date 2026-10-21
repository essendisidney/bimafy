import { Star } from "lucide-react";
import { cn } from "@/components/ui";

/** Read-only star row; `value` may be fractional (rounded to the nearest half for display). */
export function Stars({ value, className }: { value: number | null; className?: string }) {
  const v = Math.round((value ?? 0) * 2) / 2;
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={value == null ? "No ratings yet" : `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={cn("size-4", i <= v ? "fill-gold text-gold" : i - 0.5 === v ? "fill-gold/50 text-gold" : "text-line")}
        />
      ))}
    </span>
  );
}
