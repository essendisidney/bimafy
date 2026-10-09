"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { LogOut, Menu, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import { primaryNav, visibleNav, type NavItem } from "@/lib/nav";
import { setFlag, useFlag } from "@/lib/prefs";
import { CommandPalette } from "./command-palette";
import { InstallButton, SyncStatus, WarmCurrentPage } from "./pwa";
import { ThemeToggle } from "./theme-toggle";
import { NAV_ICONS } from "./nav-icons";
import { cn } from "./ui";

const COLLAPSED_KEY = "insurax.sidebar.collapsed";

const noopSubscribe = () => () => {};
/** "⌘K" on Apple devices, "Ctrl K" elsewhere (server render assumes Apple). */
function useShortcutLabel() {
  return useSyncExternalStore(
    noopSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K"),
    () => "⌘K",
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const collapsed = useFlag(COLLAPSED_KEY);
  const shortcut = useShortcutLabel();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  // ⌘K / Ctrl+K anywhere; "/" when not typing. Esc closes the phone drawer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "Escape") {
        setDrawerOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo(() => (user ? visibleNav(user.role) : []), [user]);
  const primary = useMemo(() => (user ? primaryNav(user.role) : []), [user]);
  const grouped = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of items) map.set(item.section, [...(map.get(item.section) ?? []), item]);
    return [...map.entries()];
  }, [items]);

  if (!ready || !user) {
    return <div className="grid min-h-screen place-items-center atmosphere text-mute">Loading Bimafy desk…</div>;
  }

  const current = items.filter((i) => isActive(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)[0];

  const navList = (compact: boolean, onNavigate?: () => void) => (
    <nav className={cn("space-y-5 overflow-y-auto pb-8", compact ? "px-2" : "px-3")} aria-label="Main">
      {grouped.map(([section, links]) => (
        <div key={section}>
          {compact ? (
            <div className="mx-auto mb-2 h-px w-6 bg-white/10" aria-hidden />
          ) : (
            <p className="px-3 pb-2 text-[10px] uppercase tracking-[0.18em] text-champagne/40">{section}</p>
          )}
          <div className="space-y-0.5">
            {links.map((item) => {
              const active = item.href === current?.href;
              const Icon = NAV_ICONS[item.icon];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={compact ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl text-sm transition",
                    compact ? "justify-center px-0 py-2.5" : "px-3 py-2",
                    active ? "bg-teal/25 text-gold" : "text-champagne/75 hover:bg-white/5 hover:text-champagne",
                  )}
                >
                  <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-gold" : "text-champagne/60 group-hover:text-champagne")} aria-hidden />
                  <span className={cn(compact && "sr-only")}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="flex min-h-screen">
        {/* Desktop sidebar: full or icon rail. */}
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 flex-col atmosphere-deep text-champagne transition-[width] duration-200 md:flex",
            collapsed ? "w-[76px]" : "w-64",
          )}
        >
          <div className={cn("flex items-center py-5", collapsed ? "justify-center px-2" : "justify-between px-5")}>
            <Link href="/app/dashboard" className="brand-mark text-gold" aria-label="Bimafy home">
              {collapsed ? <span className="text-2xl">B</span> : <span className="text-3xl tracking-[0.08em]">Bimafy</span>}
            </Link>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{navList(collapsed)}</div>
          <button
            onClick={() => setFlag(COLLAPSED_KEY, !collapsed)}
            className={cn(
              "m-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-champagne/60 transition hover:bg-white/5 hover:text-champagne",
              collapsed && "justify-center",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
            {collapsed ? null : <span>Collapse</span>}
          </button>
        </aside>

        {/* Phone drawer: the full menu ("More"). */}
        {drawerOpen ? (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setDrawerOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col atmosphere-deep text-champagne shadow-lift animate-slide-in-left">
              <div className="flex items-center justify-between px-5 py-5">
                <span className="brand-mark text-3xl tracking-[0.08em] text-gold">Bimafy</span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="grid h-9 w-9 place-items-center rounded-xl text-champagne/80 hover:bg-white/10"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{navList(false, () => setDrawerOpen(false))}</div>
              <InstallButton variant="menu" className="border-t border-white/10 px-2 py-2" />
              <div className="flex items-center justify-between border-t border-white/10 px-5 py-4 text-xs text-champagne/60">
                <span>Appearance</span>
                <ThemeToggle />
              </div>
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-paper/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur md:px-8">
            <button
              className="grid h-9 w-9 place-items-center rounded-xl border border-line md:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-[18px] w-[18px]" aria-hidden />
            </button>
            <span className="brand-mark text-xl text-heading md:hidden">Bimafy</span>

            <button
              onClick={() => setPaletteOpen(true)}
              className="ml-auto flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-mute transition hover:border-teal hover:text-ink md:ml-0 md:w-full md:max-w-md"
              aria-label="Search or jump to"
              aria-keyshortcuts="Meta+K Control+K"
            >
              <Search className="h-4 w-4" aria-hidden />
              <span className="hidden md:inline">Search or jump to…</span>
              <kbd className="ml-auto hidden rounded-md border border-line px-1.5 py-0.5 text-[10px] md:inline">{shortcut}</kbd>
            </button>

            <div className="flex items-center gap-3 md:ml-auto">
              <SyncStatus />
              <InstallButton className="hidden md:block" />
              <ThemeToggle className="hidden sm:flex" />
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-heading">{user.name}</p>
                <p className="text-xs text-mute">
                  {roleLabel(user.role)} · {user.branch}
                </p>
              </div>
              <button
                onClick={async () => {
                  await logout();
                  router.replace("/login");
                }}
                className="grid h-9 w-9 place-items-center rounded-xl border border-line text-mute transition hover:border-teal hover:text-teal"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </header>

          <main className="flex-1 px-4 pb-28 pt-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>

      {/* Phone tab bar: the four places this role lives in, plus everything else. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Primary"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {primary.map((item) => {
            const active = item.href === current?.href;
            const Icon = NAV_ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px]", active ? "text-teal" : "text-mute")}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="max-w-full truncate px-1">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setDrawerOpen(true)}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[11px]",
              current && !primary.some((p) => p.href === current.href) ? "text-teal" : "text-mute",
            )}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
            <span>More</span>
          </button>
        </div>
      </nav>

      <WarmCurrentPage />
      {paletteOpen ? <CommandPalette user={user} onClose={() => setPaletteOpen(false)} /> : null}
    </div>
  );
}
