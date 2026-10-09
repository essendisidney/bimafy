-- Applied to the live project on 2026-08-18 as 20260818094645_crm_ticket_links
-- (outside the repo); recorded here so the repo matches the database.
alter table crm_tickets
  add column if not exists notes text,
  add column if not exists policy_id uuid,
  add column if not exists claim_id uuid;
