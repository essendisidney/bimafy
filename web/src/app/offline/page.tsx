import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Offline · InsuraX" };

/** Served by the service worker when a page that was never opened is requested with no signal. */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
      <div className="max-w-sm">
        <p className="brand-mark text-4xl text-gold">InsuraX</p>
        <h1 className="mt-6 font-display text-3xl text-heading">You&apos;re offline</h1>
        <p className="mt-3 text-sm text-mute">
          This page hasn&apos;t been opened on this phone yet, so it isn&apos;t saved for offline use. Your agent desk
          still works: leads you add or update are saved here and sync when the signal comes back.
        </p>
        <p className="mt-2 text-sm text-mute" lang="sw">
          Huna mtandao. Dawati la wakala bado linafanya kazi — mabadiliko yatatumwa mtandao ukirudi.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/app/agent" className="rounded-xl bg-teal px-4 py-2.5 text-sm font-medium text-on-accent">
            Open agent desk
          </Link>
          <Link href="/app/dashboard" className="rounded-xl border border-line px-4 py-2.5 text-sm text-ink">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
