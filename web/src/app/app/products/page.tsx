"use client";

import Link from "next/link";
import { useProducts } from "@/lib/data";
import { money } from "@/lib/format";
import { Badge, PageHeader } from "@/components/ui";

export default function ProductsPage() {
  const { products, loading, mode } = useProducts();

  return (
    <div>
      <PageHeader
        eyebrow="Product engine"
        title="Configure and sell without developers"
        description={`Motor, medical, family, funeral, agri, livestock, travel, gadget, micro and asset. Data source: ${mode}.`}
      />
      {loading ? <p className="text-sm text-mute">Loading products…</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {products.map((p) => (
          <Link key={p.id} href={`/app/products/${p.slug}`} className="rounded-2xl border border-line bg-surface p-5 hover:border-teal">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-teal">{p.code}</p>
                <h2 className="mt-1 font-display text-2xl">{p.name}</h2>
              </div>
              <div className="flex gap-1">
                {p.shariahApproved ? <Badge status="approved" /> : null}
                {p.isMicro ? <span className="rounded-full bg-sand px-2 py-0.5 text-xs">Micro</span> : null}
              </div>
            </div>
            <p className="mt-2 text-sm text-mute">{p.summary}</p>
            <p className="mt-4 text-xs text-mute">
              From {money(p.minContribution)} · {p.frequencies.join(" / ")} · wakala {(p.wakalaRate * 100).toFixed(0)}%
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
