import type { Metadata } from "next";
import { PayLinkPage } from "./pay-link";

export const metadata: Metadata = {
  title: "Pay with M-Pesa · Bimafy",
  description: "Pay for your Bimafy cover securely with M-Pesa.",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PayLinkPage token={token} />;
}
