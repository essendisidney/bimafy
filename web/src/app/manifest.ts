import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "InsuraX",
    short_name: "InsuraX",
    description: "Sell, renew and service insurance from your phone — even with no signal.",
    id: "/app/dashboard",
    start_url: "/app/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a1628",
    theme_color: "#0a1628",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Agent desk", url: "/app/agent", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "New quotation", url: "/app/quotes/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Report a claim", url: "/app/claims/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
