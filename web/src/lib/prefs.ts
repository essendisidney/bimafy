"use client";

import { useSyncExternalStore } from "react";

/**
 * Per-browser UI preferences (e.g. a collapsed sidebar). Conveniences only:
 * storage can be blocked, so every read and write falls back silently.
 */
const listeners = new Set<() => void>();
const cache = new Map<string, boolean>();

function read(key: string, fallback: boolean) {
  if (cache.has(key)) return cache.get(key)!;
  let value = fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1" || raw === "0") value = raw === "1";
  } catch {
    // Private mode / blocked storage.
  }
  cache.set(key, value);
  return value;
}

export function setFlag(key: string, value: boolean) {
  cache.set(key, value);
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Applies for this visit only.
  }
  listeners.forEach((l) => l());
}

export function useFlag(key: string, fallback = false) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => read(key, fallback),
    () => fallback,
  );
}
