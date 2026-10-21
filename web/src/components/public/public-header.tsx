import Link from "next/link";
import { Logo } from "@/components/logo";

/** Slim header for public pages outside the landing page. */
export function PublicHeader() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
      <Link href="/" aria-label="Bimafy home">
        <Logo className="text-2xl" markClassName="h-8 w-8" />
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/agents" className="text-mute transition hover:text-ink">
          Find an agent
        </Link>
        <Link href="/login" className="rounded-xl border border-line px-3 py-1.5 text-ink transition hover:border-teal">
          Sign in
        </Link>
      </nav>
    </header>
  );
}
