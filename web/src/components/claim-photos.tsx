"use client";

import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Card } from "@/components/ui";

/** Photos the customer added to this claim from /my (private bucket, short-lived links). */
export function ClaimPhotos({ claimId }: { claimId: string }) {
  const [photos, setPhotos] = useState<{ path: string; url: string; at: string }[] | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(claimId)) return;
    let cancelled = false;
    (async () => {
      const sb = createClient();
      const { data } = await sb
        .from("claim_documents")
        .select("file_url, uploaded_at")
        .eq("claim_id", claimId)
        .eq("doc_type", "customer_photo")
        .order("uploaded_at");
      const rows = (data ?? []) as { file_url: string; uploaded_at: string }[];
      if (!rows.length) return !cancelled && setPhotos([]);
      const { data: signed } = await sb.storage.from("claim-photos").createSignedUrls(
        rows.map((r) => r.file_url),
        60 * 30,
      );
      if (cancelled) return;
      setPhotos(
        rows
          .map((r, i) => ({ path: r.file_url, url: signed?.[i]?.signedUrl ?? "", at: r.uploaded_at }))
          .filter((p) => p.url),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [claimId]);

  if (!photos) return null;
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-xl">
        <Camera className="size-5 text-teal" aria-hidden />
        Customer photos
      </h2>
      {photos.length === 0 ? (
        <p className="mt-2 text-sm text-mute">No photos yet. Move the claim to “documents pending” and the customer is texted to add them.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            <li key={p.path}>
              <a href={p.url} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs, not optimisable */}
                <img src={p.url} alt="Claim photo from the customer" className="aspect-square w-full object-cover" loading="lazy" />
              </a>
              <p className="mt-1 text-[11px] text-mute">{new Date(p.at).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
