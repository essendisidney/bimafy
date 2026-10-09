-- InsuraX Agent desk: lead scoring inputs, follow-ups and activity timeline.
alter table leads
  add column if not exists estimated_value numeric(14, 2),
  add column if not exists source text,
  add column if not exists next_action_at date,
  add column if not exists lost_reason text,
  add column if not exists activities jsonb not null default '[]'::jsonb;

create index if not exists leads_agent_next_action_idx
  on leads (agent_id, next_action_at)
  where status in ('new', 'contacted', 'quoted');
