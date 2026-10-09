-- InsuraX Agent desk: lead scoring inputs, follow-ups and activity timeline.
alter table leads
  add column if not exists estimated_value numeric(14, 2),
  add column if not exists source text,
  add column if not exists next_action_at date,
  add column if not exists lost_reason text,
  add column if not exists activities jsonb not null default '[]'::jsonb;

do $$ begin
  alter table leads
    add constraint leads_status_check check (status in ('new', 'contacted', 'quoted', 'won', 'lost')) not valid;
exception when duplicate_object then null; end $$;

create index if not exists leads_agent_next_action_idx
  on leads (agent_id, next_action_at)
  where status in ('new', 'contacted', 'quoted');
create index if not exists leads_broker_idx on leads (broker_id) where broker_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: a lead belongs to its agent or broker. 00007 let every staff role
-- (including every other agent) read and edit all leads — replace that.
-- ---------------------------------------------------------------------------
drop policy if exists staff_all_leads on leads;

drop policy if exists leads_own_distributor on leads;
create policy leads_own_distributor on leads
  for all to authenticated
  using (
    agent_id in (select id from agents where profile_id = auth.uid())
    or broker_id in (select id from brokers where profile_id = auth.uid())
  )
  with check (
    agent_id in (select id from agents where profile_id = auth.uid())
    or broker_id in (select id from brokers where profile_id = auth.uid())
  );

-- Managers and the contact centre work every lead in their own operator.
drop policy if exists leads_operator_managers on leads;
create policy leads_operator_managers on leads
  for all to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'branch_manager', 'call_center')
        and p.operator_id = leads.operator_id
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'branch_manager', 'call_center')
        and p.operator_id = leads.operator_id
    )
  );

-- Append to a lead's timeline atomically (no read-modify-write races between
-- an agent's phone and laptop). SECURITY INVOKER, so the RLS above applies.
create or replace function public.log_lead_activity(p_lead_id uuid, p_activity jsonb, p_patch jsonb default '{}'::jsonb)
returns setof leads
language sql
security invoker
set search_path = public
as $$
  update leads set
    activities = jsonb_build_array(p_activity) || activities,
    status = coalesce(p_patch ->> 'status', status),
    next_action_at = coalesce((p_patch ->> 'next_action_at')::date, next_action_at),
    lost_reason = coalesce(p_patch ->> 'lost_reason', lost_reason)
  where id = p_lead_id
  returning *;
$$;

revoke execute on function public.log_lead_activity(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.log_lead_activity(uuid, jsonb, jsonb) to authenticated;
