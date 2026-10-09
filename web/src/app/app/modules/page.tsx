import Link from "next/link";
import { INSURAX_IDEA, modules } from "@/lib/modules";
import { Card, PageHeader } from "@/components/ui";

export default function ModulesPage() {
  return (
    <div>
      <PageHeader
        eyebrow="InsuraX platform"
        title="The insurance operating system"
        description={INSURAX_IDEA}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {modules.map((mod) => (
          <Link key={mod.slug} href={mod.href} className="group">
            <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:border-teal">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal">{mod.code}</p>
              <h2 className="mt-2 font-display text-2xl text-heading">{mod.name}</h2>
              <p className="mt-2 text-sm text-mute">{mod.tagline}</p>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">{mod.description}</p>
              <ul className="mt-4 space-y-1 text-xs text-mute">
                {mod.capabilities.map((cap) => (
                  <li key={cap}>· {cap}</li>
                ))}
              </ul>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
