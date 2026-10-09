"use client";

import { CloudOff, Download, RefreshCw, Share } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLeadSync } from "@/lib/leads";
import { promptInstall, useInstallState, useOnline, warmPages } from "@/lib/pwa";
import { cn } from "./ui";

/** Registers the service worker in production builds (dev keeps hot reload predictable). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Unsupported or blocked (private mode): the app still works online.
    });
  }, []);
  return null;
}

/** Keeps every app page the user opens available offline. */
export function WarmCurrentPage() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) warmPages([pathname]);
  }, [pathname]);
  return null;
}

/** Offline / waiting-to-sync pill for the app header. Hidden when all is well. */
export function SyncStatus({ className }: { className?: string }) {
  const online = useOnline();
  const { pending } = useLeadSync();
  if (online && pending === 0) return null;
  const label = !online
    ? pending
      ? `Offline · ${pending} to sync`
      : "Offline"
    : `Syncing ${pending}…`;
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        online ? "border-teal/40 bg-teal/10 text-teal-ink" : "border-gold/50 bg-gold/15 text-gold-ink",
        className,
      )}
      title={
        online
          ? "Sending changes saved while you were offline"
          : "No connection. Lead changes are saved on this phone and sync automatically."
      }
    >
      {online ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CloudOff className="h-3.5 w-3.5" aria-hidden />}
      {label}
    </span>
  );
}

/** "Install app" — the native prompt where supported, Add-to-Home-Screen steps on iPhone. */
export function InstallButton({ className, variant = "header" }: { className?: string; variant?: "header" | "menu" }) {
  const state = useInstallState();
  const [showIosHint, setShowIosHint] = useState(false);
  if (state === "installed" || state === "unavailable") return null;
  const base =
    variant === "menu"
      ? "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-champagne/90 hover:bg-white/10"
      : "flex h-9 items-center gap-2 rounded-xl border border-line px-3 text-sm text-ink transition hover:border-teal hover:text-teal";
  return (
    <div className={cn("relative", className)}>
      <button
        className={base}
        onClick={() => (state === "prompt" ? void promptInstall() : setShowIosHint((v) => !v))}
        aria-expanded={state === "ios" ? showIosHint : undefined}
      >
        <Download className="h-4 w-4" aria-hidden />
        <span>Install app</span>
      </button>
      {state === "ios" && showIosHint ? (
        <p
          role="note"
          className={cn(
            "z-40 mt-2 w-64 rounded-xl border border-line bg-surface p-3 text-xs text-ink shadow-lift",
            variant === "header" ? "absolute right-0 top-full" : "",
          )}
        >
          Tap <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-label="Share" /> in Safari, then{" "}
          <span className="font-medium">Add to Home Screen</span>. Bimafy then opens full screen and works offline.
        </p>
      ) : null}
    </div>
  );
}
