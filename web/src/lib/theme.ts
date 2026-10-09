"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY } from "./theme-boot";

export type Theme = "system" | "light" | "dark";

const listeners = new Set<() => void>();
let current: Theme | null = null;

function read(): Theme {
  if (current) return current;
  try {
    const raw = localStorage.getItem(THEME_KEY);
    current = raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    current = "system";
  }
  return current;
}

export function setTheme(theme: Theme) {
  current = theme;
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Blocked storage: still applies for this visit.
  }
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => "system",
  );
}
