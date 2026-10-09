"use client";

import { useSyncExternalStore } from "react";

export type Lang = "en" | "sw";

const KEY = "insurax.lang";
const listeners = new Set<() => void>();
let current: Lang | null = null;

function read(): Lang {
  if (current) return current;
  try {
    current = localStorage.getItem(KEY) === "sw" ? "sw" : "en";
  } catch {
    current = "en";
  }
  return current;
}

export function setLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Private mode / blocked storage: the choice still applies for this visit.
  }
  listeners.forEach((l) => l());
}

/** Visitor's language for the landing page; English on the server render. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => "en",
  );
}
