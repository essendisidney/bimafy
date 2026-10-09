import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Outfit } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa";
import { AuthProvider } from "@/lib/auth";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-boot";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Bimafy — The End-to-End Insurance Operating Platform",
  description:
    "Bimafy is the technology infrastructure that runs an insurer, broker, MGA, agent network, or embedded-insurance business end to end.",
  applicationName: "Bimafy",
  appleWebApp: { capable: true, title: "Bimafy", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1220" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the boot script may set data-theme before React hydrates.
    <html lang="en" className={`${outfit.variable} ${cormorant.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-paper font-sans text-ink">
        <AuthProvider>{children}</AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
