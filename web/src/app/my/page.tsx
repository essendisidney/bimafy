import type { Metadata } from "next";
import { CustomerPortal } from "./portal";

export const metadata: Metadata = {
  title: "My cover · Bimafy",
  description: "See your Bimafy policies, pay by M-Pesa, download your certificate and report a claim.",
};

export default function Page() {
  return <CustomerPortal />;
}
