"use client";

import { SearchX } from "lucide-react";
import { useParams } from "next/navigation";
import { useProducts } from "@/lib/data";
import { money } from "@/lib/format";
import { Button, Card, Empty, PageHeader } from "@/components/ui";

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { products, loading } = useProducts();
  const product = products.find((p) => p.slug === slug);

  if (loading) return <p className="text-sm text-mute">Loading product…</p>;
  if (!product) return (
      <Card>
        <Empty
          icon={SearchX}
          title="Product not found"
          hint="This product may have been retired."
          action={<Button href="/app/products" variant="secondary">All products</Button>}
        />
      </Card>
    );

  return (
    <div>
      <PageHeader
        eyebrow={product.line.replaceAll("_", " ")}
        title={product.name}
        description={product.description}
        actions={<Button href={`/app/quotes/new?product=${product.slug}`}>Get quotation</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-display text-xl">Covers & riders</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {product.covers.map((c) => (
              <li key={c.code} className="flex justify-between rounded-xl border border-line px-3 py-2">
                <span>{c.name}</span>
                <span className="text-mute">{c.optional ? "Optional rider" : "Core"}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="space-y-3 p-5 text-sm">
          <Row k="Model" v={product.model} />
          <Row k="Wakala fee" v={`${(product.wakalaRate * 100).toFixed(0)}%`} />
          <Row k="Waiting period" v={`${product.waitingDays} days`} />
          <Row k="Min contribution" v={money(product.minContribution)} />
          <Row k="Max sum covered" v={money(product.maxSumCovered)} />
          <Row k="Frequencies" v={product.frequencies.join(", ")} />
          <Row k="Shariah approved" v={product.shariahApproved ? "Yes" : "No"} />
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line pb-2">
      <span className="text-mute">{k}</span>
      <span className="font-medium capitalize">{v}</span>
    </div>
  );
}
