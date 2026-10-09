"use client";

import { computeAnalyticsSeries, computeKpis } from "@/lib/analytics";
import { compactMoney, money, pct } from "@/lib/format";
import { usePlatform } from "@/lib/store";
import { Card, PageHeader, Stat } from "@/components/ui";

export default function AnalyticsPage() {
  const state = usePlatform();
  const kpis = computeKpis(state);
  const { gwpByMonth, gwpByProduct, gwpByBranch } = computeAnalyticsSeries(state);
  const maxMonth = Math.max(...gwpByMonth.map((m) => Math.max(m.gwp, m.claims)), 0.1);

  return (
    <div>
      <PageHeader
        eyebrow="Bimafy Data"
        title="Analytics & regulatory cockpit"
        description="Live GWP, NWP, loss & combined ratios from the PAS book — charts update as you quote, bind, claim and pay."
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="GWP" value={compactMoney(kpis.gwp)} hint="Gross written contribution" />
        <Stat label="NWP" value={compactMoney(kpis.nwp)} />
        <Stat label="Claims ratio" value={pct(kpis.claimsRatio)} />
        <Stat label="Loss ratio" value={pct(kpis.lossRatio)} />
        <Stat label="Combined ratio" value={pct(kpis.combined)} />
        <Stat label="Renewal rate" value={pct(kpis.renewalRate)} />
        <Stat label="CLV (avg)" value={money(kpis.clv)} />
        <Stat label="Policy count" value={String(kpis.policyCount)} />
        <Stat label="Active customers" value={String(kpis.participants)} />
        <Stat label="Average contribution" value={money(kpis.avgPremium)} />
        <Stat label="Claims TAT" value={`${kpis.tatHours} hrs`} />
        <Stat label="Fraud rate" value={pct(kpis.fraudRate)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-display text-xl">Contribution vs claims (KES M)</h2>
          <div className="mt-6 flex h-48 items-end gap-4">
            {gwpByMonth.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-40 w-full items-end gap-1">
                  <div className="w-1/2 rounded-t bg-teal" style={{ height: `${(m.gwp / maxMonth) * 100}%` }} />
                  <div className="w-1/2 rounded-t bg-gold" style={{ height: `${(m.claims / maxMonth) * 100}%` }} />
                </div>
                <span className="text-xs text-mute">{m.month}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-mute">Teal = GWP · Gold = claims · from live book</p>
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-xl">Revenue by product</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {gwpByProduct.length === 0 ? (
              <li className="text-mute">No policies in book yet.</li>
            ) : (
              gwpByProduct.map((p) => (
                <li key={p.name}>
                  <div className="flex justify-between">
                    <span>{p.name}</span>
                    <span>{p.value}%</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-sand">
                    <div className="h-2 rounded-full bg-forest" style={{ width: `${Math.min(100, p.value * 2)}%` }} />
                  </div>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>
      <Card className="mt-4 p-5">
        <h2 className="font-display text-xl">Revenue by branch</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {gwpByBranch.map((b) => (
            <div key={b.name} className="rounded-xl bg-sand p-3 text-sm">
              <p className="text-mute">{b.name}</p>
              <p className="mt-1 font-display text-2xl">{b.value}M</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
