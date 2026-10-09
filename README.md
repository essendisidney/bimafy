# Bimafy

**The End-to-End Insurance Operating Platform**

Not just an insurance marketplace. Bimafy is the technology infrastructure that runs an insurer, broker, MGA, agent network, or embedded-insurance business end to end.

> **One platform. Every insurance workflow. One source of truth.**

| Product | What it runs |
| --- | --- |
| **Bimafy Core** | Policy administration |
| **Bimafy Risk** | Underwriting & risk scoring |
| **Bimafy Claims** | Digital claims management |
| **Bimafy Pay** | Premiums, collections & reconciliation |
| **Bimafy Fraud** | Fraud & anomaly detection |
| **Bimafy Connect** | APIs & embedded insurance |
| **Bimafy Agent** | Agency / broker ecosystem |
| **Bimafy AI** | Intelligence, automation & decisioning |
| **Bimafy Data** | Analytics & regulatory reporting |
| **Bimafy Customer** | Customer self-service |

This repo ships a working **Next.js console** (`web/`), a **Postgres/Supabase schema** (`supabase/`), and an **offline-first Flutter field app** (`agent_app/`). Kenya demo data is included so you can walk the journey without wiring keys first.

## Stack

- **Web:** Next.js on Vercel
- **Data / Auth:** Supabase (Postgres + Auth + RLS)
- **Mobile:** Flutter agent app
- **Payments:** M-Pesa Daraja (live with keys, simulated without)
- **Channels:** WhatsApp + USSD webhooks
- **Embed:** Partner API `/api/v1`

## Run locally

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Launch console** → pick a persona (no password in demo mode).

Useful paths:

- `/app/modules` — ten-product architecture map
- `/app/quotes/new` — price a cover and convert to a policy
- `/app/claims/new` — FNOL with fraud score
- `/app/fraud` — investigation queue
- `/app/customer` — policyholder self-service
- `/app/analytics` — executive cockpit
- `/app/integrations` — IPRS / NTSA / OCR / CRB + partner API playground

### Supabase

Copy `web/.env.example` to `web/.env.local` and point at your Supabase project:

```
NEXT_PUBLIC_SUPABASE_URL=https://mzrilftjlnnlntzogkws.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
NEXT_PUBLIC_OPERATOR_ID=00000000-0000-4000-8000-000000000001
```

Without env vars the console stays in **demo mode**. With env vars it switches to **Supabase Auth + Postgres** for products, quotes, policies, and claims.

Create a first admin in Supabase Auth (`admin@bimafy.app`), then:

```sql
update profiles
set role = 'admin',
    operator_id = '00000000-0000-4000-8000-000000000001',
    full_name = 'Platform Admin'
where email = 'admin@bimafy.app';
```

Migrations live in `supabase/migrations/` (`00001`–`00011`). The live project records them under timestamp versions (e.g. `20261009085750_agency_desk`) because they were applied through the dashboard/MCP rather than the CLI, so **don't run `supabase db push`** against it — it would try to re-apply everything. Apply a new migration by pasting the file into the SQL editor (or via the Supabase MCP `apply_migration`), then keep the file here as the record.

To set up a fresh project instead, run the files in order.

Leads are stored in Supabase for signed-in users. Row-level security limits agents and brokers to their own leads, while `admin`, `branch_manager` and `call_center` see every lead in their operator. Link a login to its distributor record with `update agents set profile_id = '<auth user id>' where agent_code = 'AG-KE-0142';` (and the same on `brokers`). Local personas from the login screen stay on demo data.

Optionally set Auth `app_metadata`: `{ "role": "admin", "operator_id": "00000000-0000-4000-8000-000000000001" }`.

### Partner API

Auth: `Authorization: Bearer bimafy_pk_demo` (also `bimafy_pk_sacco`, `bimafy_pk_ride`).

- `GET /api/v1/products`
- `POST /api/v1/quotes` → `POST /api/v1/policies` (bind) → `POST /api/v1/claims`

### Flutter agent app

```bash
cd agent_app
flutter pub get
flutter run
```

## Vercel

Create the project with **Root Directory = `web`**. Set these environment variables on the project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_OPERATOR_ID`
