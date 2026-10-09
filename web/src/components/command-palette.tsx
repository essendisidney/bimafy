"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FilePlus2, LifeBuoy, Search, ShieldCheck, Siren, UserPlus, Users, FileText, type LucideIcon } from "lucide-react";
import { useClaimsBook, usePoliciesBook, useQuotesBook } from "@/lib/data";
import { useLeads } from "@/lib/leads";
import { visibleNav } from "@/lib/nav";
import { canAccessPath } from "@/lib/rbac";
import { agents, brokers } from "@/lib/seed";
import type { SessionUser } from "@/lib/types";
import { NAV_ICONS } from "./nav-icons";
import { cn } from "./ui";

type Entry = {
  id: string;
  group: "Actions" | "Pages" | "Records";
  label: string;
  hint?: string;
  href: string;
  icon: LucideIcon;
  /** Extra text matched by search but not shown. */
  keywords?: string;
};

const MAX_RECORDS = 8;

function matches(entry: Entry, terms: string[]) {
  const hay = `${entry.label} ${entry.hint ?? ""} ${entry.keywords ?? ""}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

function rank(entry: Entry, q: string) {
  const label = entry.label.toLowerCase();
  if (label === q) return 0;
  if (label.startsWith(q)) return 1;
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 2;
  return 3;
}

/** Records the palette may surface for this user (demo data isn't RLS-scoped, so scope it here). */
function useRecords(user: SessionUser): Entry[] {
  const { quotes } = useQuotesBook();
  const { policies } = usePoliciesBook();
  const { claims } = useClaimsBook();
  const { leads } = useLeads();
  const own = <T extends { participantId?: string }>(rows: T[]) =>
    user.role === "participant" ? rows.filter((r) => r.participantId && r.participantId === user.participantId) : rows;

  const agent = agents.find((a) => a.id === user.agentId || a.dbId === user.agentId);
  const broker = brokers.find((b) => b.id === user.brokerId || b.dbId === user.brokerId);
  const myLeads = leads.filter((l) => {
    if (user.role === "agent") return Boolean(l.agentId) && (l.agentId === user.agentId || l.agentId === agent?.id || l.agentId === agent?.dbId);
    if (user.role === "broker") return Boolean(l.brokerId) && (l.brokerId === user.brokerId || l.brokerId === broker?.id || l.brokerId === broker?.dbId);
    return ["admin", "branch_manager", "call_center"].includes(user.role);
  });

  const out: Entry[] = [
    ...own(policies).map((p) => ({
      id: `pol-${p.id}`,
      group: "Records" as const,
      label: p.number,
      hint: `${p.participantName} · ${p.productName}`,
      href: `/app/policies/${p.id}`,
      icon: ShieldCheck,
    })),
    ...own(claims).map((c) => ({
      id: `clm-${c.id}`,
      group: "Records" as const,
      label: c.number,
      hint: `${c.participantName} · claim on ${c.policyNumber}`,
      href: `/app/claims/${c.id}`,
      icon: LifeBuoy,
    })),
    ...own(quotes).map((q) => ({
      id: `qt-${q.id}`,
      group: "Records" as const,
      label: q.number,
      hint: `${q.participantName} · ${q.productName}`,
      href: `/app/quotes/${q.id}`,
      icon: FileText,
    })),
    ...myLeads.map((l) => ({
      id: `ld-${l.id}`,
      group: "Records" as const,
      label: l.name,
      hint: `Lead · ${l.productLine.replaceAll("_", " ")} · ${l.status}`,
      href: user.role === "broker" ? "/app/broker" : `/app/agent?lead=${encodeURIComponent(l.id)}`,
      icon: Users,
      keywords: l.phone,
    })),
  ];
  return out.filter((e) => canAccessPath(user.role, e.href.split("?")[0]));
}

function actionsFor(user: SessionUser): Entry[] {
  const all: Entry[] = [
    { id: "a-quote", group: "Actions", label: "New quotation", hint: "Price cover for a client", href: "/app/quotes/new", icon: FilePlus2, keywords: "quote price" },
    { id: "a-claim", group: "Actions", label: "Report a claim", hint: "First notice of loss", href: "/app/claims/new", icon: Siren, keywords: "fnol accident" },
    { id: "a-lead", group: "Actions", label: "Capture a lead", hint: "Agent desk · Today", href: "/app/agent", icon: UserPlus, keywords: "prospect new client" },
  ];
  return all.filter((a) => canAccessPath(user.role, a.href));
}

export function CommandPalette({ user, onClose }: { user: SessionUser; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const records = useRecords(user);

  const pages = useMemo<Entry[]>(
    () =>
      visibleNav(user.role).map((n) => ({
        id: `page-${n.href}`,
        group: "Pages",
        label: n.label,
        hint: n.section,
        href: n.href,
        icon: NAV_ICONS[n.icon],
      })),
    [user.role],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const actions = actionsFor(user);
    if (!q) return [...actions, ...pages];
    const terms = q.split(/\s+/);
    const byRank = (a: Entry, b: Entry) => rank(a, q) - rank(b, q);
    return [
      ...actions.filter((e) => matches(e, terms)).sort(byRank),
      ...pages.filter((e) => matches(e, terms)).sort(byRank),
      ...records.filter((e) => matches(e, terms)).sort(byRank).slice(0, MAX_RECORDS),
    ];
  }, [query, pages, records, user]);

  const current = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    document.getElementById(`${listId}-${current}`)?.scrollIntoView({ block: "nearest" });
  }, [current, listId]);

  function go(entry: Entry | undefined) {
    if (!entry) return;
    onClose();
    router.push(entry.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (results.length ? (Math.min(i, results.length - 1) + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (results.length ? (Math.min(i, results.length - 1) - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[current]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  let lastGroup: Entry["group"] | null = null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search Bimafy"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-lift animate-pop-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-mute" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search pages, policies, claims, leads…"
            className="h-14 w-full bg-transparent text-sm text-ink outline-none placeholder:text-mute"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results.length ? `${listId}-${current}` : undefined}
            aria-autocomplete="list"
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[10px] text-mute sm:inline">ESC</kbd>
        </div>

        <ul id={listId} role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
          {results.map((entry, i) => {
            const header = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            const Icon = entry.icon;
            return (
              <li key={entry.id} role="presentation">
                {header ? (
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-mute">{header}</p>
                ) : null}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === current}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(entry)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                    i === current ? "bg-teal/10 text-ink" : "text-ink/85",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-lg border",
                      i === current ? "border-teal/30 bg-surface text-teal" : "border-line text-mute",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{entry.label}</span>
                    {entry.hint ? <span className="block truncate text-xs text-mute">{entry.hint}</span> : null}
                  </span>
                  {i === current ? <CornerDownLeft className="h-4 w-4 shrink-0 text-teal" aria-hidden /> : null}
                </div>
              </li>
            );
          })}
          {!results.length ? (
            <li className="px-3 py-10 text-center text-sm text-mute">
              Nothing matches “{query}”. Try a policy number, a client name or a page.
            </li>
          ) : null}
        </ul>

        <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 text-[11px] text-mute">
          <span>
            <kbd className="font-sans">↑↓</kbd> move
          </span>
          <span>
            <kbd className="font-sans">↵</kbd> open
          </span>
          <span>
            <kbd className="font-sans">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
