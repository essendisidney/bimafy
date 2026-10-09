"use client";

import { useSyncExternalStore } from "react";

/** Chrome/Edge/Android's deferred install prompt (not in the DOM typings). */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
let deferred: InstallPromptEvent | null = null;
let installed = false;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it for our own button instead of the mini-infobar
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPad Safari: no install prompt, the user adds it from the Share menu. */
function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export type InstallState = "installed" | "prompt" | "ios" | "unavailable";

function installState(): InstallState {
  if (installed || isStandalone()) return "installed";
  if (deferred) return "prompt";
  if (isIOS()) return "ios";
  return "unavailable";
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, installState, () => "unavailable");
}

/** Shows the browser's install dialog; resolves true if the user accepted. */
export async function promptInstall() {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome === "accepted";
}

export function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine !== false,
    () => true,
  );
}

/** Ask the service worker to keep these pages for offline use. */
export function warmPages(urls: string[]) {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: "warm", urls });
}
