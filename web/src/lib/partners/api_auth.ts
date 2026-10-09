import { NextResponse } from "next/server";

export type PartnerAuth = {
  partnerId: string;
  name: string;
  key: string;
};

const DEFAULT_PARTNERS: PartnerAuth[] = [
  { partnerId: "ptn-demo", name: "Bimafy Demo Embed", key: "insurax_pk_demo" },
  { partnerId: "ptn-sacco", name: "Demo SACCO Gateway", key: "insurax_pk_sacco" },
  { partnerId: "ptn-ride", name: "Demo Ride-hailing", key: "insurax_pk_ride" },
];

export function listPartnerKeys(): PartnerAuth[] {
  const extra = (process.env.PARTNER_API_KEYS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((key, i) => ({
      partnerId: `ptn-env-${i + 1}`,
      name: `Env partner ${i + 1}`,
      key,
    }));
  return [...DEFAULT_PARTNERS, ...extra];
}

export function authenticatePartner(req: Request): PartnerAuth | null {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const apiKey = req.headers.get("x-api-key")?.trim() ?? bearer;
  if (!apiKey) return null;
  return listPartnerKeys().find((p) => p.key === apiKey) ?? null;
}

export function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized", hint: "Pass Authorization: Bearer insurax_pk_demo or X-API-Key" },
    { status: 401 },
  );
}
