import type { Metadata } from "next";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Rate your agent · Bimafy", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ReviewForm token={token} />;
}
