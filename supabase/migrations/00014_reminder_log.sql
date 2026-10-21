-- Bimafy: one shared record of client reminders, and a secret-gated feed for
-- the morning auto-send job.
--
-- reminder_log            - one row per reminder ever sent (key = policy:kind:date), so two
--                           agents (or an agent and the morning job) never send the same one twice.
-- reminder_mark_sent      - staff record a reminder they sent by SMS or WhatsApp.
-- reminders_feed          - the morning job reads policies, client phones and settled payments
--                           (needs the cron secret; no client can call it usefully).
-- reminders_claim/finish  - the job claims a key before sending and records the outcome.

create table if not exists public.reminder_log (
  key text primary key,
  operator_id uuid not null references public.operators(id) on delete cascade,
  policy_id uuid references public.policies(id) on delete cascade,
  kind text not null,
  channel text not null check (channel in ('sms', 'whatsapp')),
  status text not null default 'sent' check (status in ('sending', 'sent', 'failed')),
  automatic boolean not null default false,
  provider text,
  provider_message_id text,
  error text,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now()
);
create index if not exists reminder_log_operator_sent_idx on public.reminder_log (operator_id, sent_at desc);

alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;
grant select on public.reminder_log to authenticated;

drop policy if exists reminder_log_staff_read on public.reminder_log;
create policy reminder_log_staff_read on public.reminder_log
  for select to authenticated
  using (public.is_staff() and operator_id = (select operator_id from public.profiles where id = auth.uid()));

-- Staff record a reminder they just sent. Returns false when it was already recorded.
create or replace function public.reminder_mark_sent(
  p_key text, p_policy_id uuid, p_kind text, p_channel text, p_provider_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid;
  v_rows int;
begin
  if not public.is_staff() then
    raise exception 'Only agency staff can record reminders' using errcode = '42501';
  end if;
  select operator_id into v_operator from public.profiles where id = auth.uid();
  if v_operator is null then
    raise exception 'Your profile has no agency' using errcode = '42501';
  end if;
  -- Only the caller's own agency's policies.
  if p_policy_id is not null and not exists (
    select 1 from public.policies where id = p_policy_id and operator_id = v_operator
  ) then
    raise exception 'Unknown policy' using errcode = '42501';
  end if;
  insert into public.reminder_log (key, operator_id, policy_id, kind, channel, provider_message_id, sent_by)
  values (left(p_key, 200), v_operator, p_policy_id, left(p_kind, 40), p_channel, left(p_provider_message_id, 120), auth.uid())
  on conflict (key) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function private.reminders_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from private.app_secrets s
    where s.name = 'reminders_cron'
      and s.sha256 = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
  );
$$;
revoke all on function private.reminders_secret_ok(text) from public, anon, authenticated;

-- Everything the morning job needs to work out who to remind: policies near renewal or on an
-- instalment plan, the client's phone, the agent's name, settled payments and already-sent keys.
create or replace function public.reminders_feed(p_secret text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not private.reminders_secret_ok(p_secret) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  with pol as (
    select p.*
    from public.policies p
    where p.status not in ('cancelled', 'draft', 'pending_payment', 'pending_underwriting')
      and (
        p.expiry_date between current_date - 10 and current_date + 40
        or p.risk_payload ? 'instalmentPlan' and p.risk_payload -> 'instalmentPlan' <> 'null'::jsonb
      )
  )
  select jsonb_build_object(
    'policies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pol.id,
        'operator_id', pol.operator_id,
        'number', pol.policy_number,
        'status', pol.status,
        'frequency', pol.frequency,
        'contribution', pol.contribution,
        'inception', pol.inception_date,
        'expiry', pol.expiry_date,
        'created_at', pol.created_at,
        'instalment_plan', nullif(pol.risk_payload -> 'instalmentPlan', 'null'::jsonb),
        'participant_id', pol.participant_id,
        'participant_name', pa.full_name,
        'phone', pa.phone,
        'product_name', pr.name,
        'agent_id', pol.agent_id,
        'agent_name', ag.full_name
      ))
      from pol
      join public.participants pa on pa.id = pol.participant_id
      join public.products pr on pr.id = pol.product_id
      left join public.agents ag on ag.id = pol.agent_id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'policy_number', pol.policy_number,
        'amount', pay.amount,
        'status', pay.status,
        'paid_at', pay.paid_at
      ))
      from public.payments pay
      join pol on pol.id = pay.policy_id
      where pay.status in ('completed', 'reconciled') and pay.paid_at > now() - interval '400 days'
    ), '[]'::jsonb),
    'sent', coalesce((
      select jsonb_agg(l.key)
      from public.reminder_log l
      where l.sent_at > now() - interval '120 days' and l.status <> 'failed'
    ), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

-- Claim a reminder before sending it. False means someone already sent (or is sending) it.
create or replace function public.reminders_claim(p_secret text, p_key text, p_policy_id uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  if not private.reminders_secret_ok(p_secret) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  insert into public.reminder_log as l (key, operator_id, policy_id, kind, channel, status, automatic)
  select left(p_key, 200), p.operator_id, p.id, left(p_kind, 40), 'sms', 'sending', true
  from public.policies p where p.id = p_policy_id
  on conflict (key) do update
    set status = 'sending', sent_at = now(), error = null
    -- A failed attempt may be retried the next morning; a sent or in-flight one never.
    where l.status = 'failed';
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.reminders_finish(
  p_secret text, p_key text, p_ok boolean, p_provider text, p_message_id text, p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.reminders_secret_ok(p_secret) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  update public.reminder_log
     set status = case when p_ok then 'sent' else 'failed' end,
         provider = left(p_provider, 40),
         provider_message_id = left(p_message_id, 120),
         error = left(p_error, 300),
         sent_at = now()
   where key = p_key and automatic;
end;
$$;

revoke execute on function public.reminder_mark_sent(text, uuid, text, text, text) from public, anon;
grant execute on function public.reminder_mark_sent(text, uuid, text, text, text) to authenticated;
revoke execute on function public.reminders_feed(text) from public;
revoke execute on function public.reminders_claim(text, text, uuid, text) from public;
revoke execute on function public.reminders_finish(text, text, boolean, text, text, text) from public;
grant execute on function public.reminders_feed(text) to anon, authenticated;
grant execute on function public.reminders_claim(text, text, uuid, text) to anon, authenticated;
grant execute on function public.reminders_finish(text, text, boolean, text, text, text) to anon, authenticated;

-- Set the cron secret (the same value as CRON_SECRET in Vercel):
--   insert into private.app_secrets (name, sha256)
--   values ('reminders_cron', encode(extensions.digest('<CRON_SECRET>', 'sha256'), 'hex'))
--   on conflict (name) do update set sha256 = excluded.sha256, updated_at = now();
