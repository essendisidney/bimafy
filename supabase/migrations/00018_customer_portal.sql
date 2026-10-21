-- Bimafy: customer self-service. A customer signs in with their phone number and a code sent by
-- SMS, then sees their policies, payments and claims, pays by M-Pesa and reports a claim.
--
-- Codes are issued only by our server (gated by the server secret, private.app_secrets
-- 'reminders_cron' = CRON_SECRET), so nobody can mint a code for someone else's number.
-- The database stores only hashes of codes and session tokens.

create table if not exists private.customer_otps (
  phone text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sent_count int not null default 1,
  window_start timestamptz not null default now()
);

create table if not exists private.customer_sessions (
  token_hash text primary key,
  phone text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  last_seen_at timestamptz not null default now()
);
create index if not exists customer_sessions_phone_idx on private.customer_sessions (phone);

-- 0712345678 / +254 712 345 678 / 712345678 → 254712345678
create or replace function private.norm_phone(p text)
returns text
language sql
immutable
as $$
  select case
    when d ~ '^0[17][0-9]{8}$' then '254' || substr(d, 2)
    when d ~ '^[17][0-9]{8}$' then '254' || d
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;


create or replace function public.customer_otp_issue(p_secret text, p_phone text, p_code_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := private.norm_phone(p_phone);
  cur private.customer_otps%rowtype;
begin
  if not private.reminders_secret_ok(p_secret) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if v_phone !~ '^254[17][0-9]{8}$' then
    raise exception 'Enter a Kenyan mobile number (07… or 01…)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.participants where private.norm_phone(phone) = v_phone) then
    return false;
  end if;
  select * into cur from private.customer_otps where phone = v_phone for update;
  if found and cur.window_start > now() - interval '15 minutes' and cur.sent_count >= 3 then
    raise exception 'Too many codes requested — please wait 15 minutes' using errcode = 'P0001';
  end if;
  insert into private.customer_otps (phone, code_hash, expires_at, attempts, sent_count, window_start)
  values (v_phone, p_code_hash, now() + interval '10 minutes', 0, 1, now())
  on conflict (phone) do update set
    code_hash = excluded.code_hash,
    expires_at = excluded.expires_at,
    attempts = 0,
    sent_count = case when private.customer_otps.window_start > now() - interval '15 minutes'
                      then private.customer_otps.sent_count + 1 else 1 end,
    window_start = case when private.customer_otps.window_start > now() - interval '15 minutes'
                        then private.customer_otps.window_start else now() end;
  return true;
end;
$$;

create or replace function public.customer_otp_verify(p_phone text, p_code text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_phone text := private.norm_phone(p_phone);
  cur private.customer_otps%rowtype;
  v_token text;
begin
  select * into cur from private.customer_otps where phone = v_phone for update;
  if not found or cur.expires_at < now() then
    raise exception 'That code has expired — request a new one' using errcode = 'P0001';
  end if;
  if cur.attempts >= 5 then
    raise exception 'Too many wrong codes — request a new one' using errcode = 'P0001';
  end if;
  if cur.code_hash <> encode(extensions.digest(v_phone || ':' || coalesce(p_code, ''), 'sha256'), 'hex') then
    update private.customer_otps set attempts = attempts + 1 where phone = v_phone;
    raise exception 'That code is not right — check the SMS and try again' using errcode = '22023';
  end if;
  update private.customer_otps set expires_at = now() - interval '1 second' where phone = v_phone;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.customer_sessions (token_hash, phone)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_phone);
  return v_token;
end;
$$;

-- The phone behind a live session (and keep it alive), or null.
create or replace function private.portal_phone(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_phone text;
begin
  update private.customer_sessions set last_seen_at = now()
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and expires_at > now()
  returning phone into v_phone;
  return v_phone;
end;
$$;

create or replace function private.portal_can_pay(p public.policies)
returns boolean
language sql
stable
as $$
  select p.status in ('pending_payment', 'lapsed', 'suspended')
      or (p.status in ('active', 'reinstated', 'expired') and p.expiry_date between current_date - 60 and current_date + 45);
$$;

create or replace function public.customer_portal(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := private.portal_phone(p_token);
begin
  if v_phone is null then
    raise exception 'Please sign in again' using errcode = '42501';
  end if;
  return (
    with me as (select * from public.participants where private.norm_phone(phone) = v_phone),
    pol as (select p.* from public.policies p join me on me.id = p.participant_id)
    select jsonb_build_object(
      'first_name', (select split_part(full_name, ' ', 1) from me order by created_at limit 1),
      'full_name', (select full_name from me order by created_at limit 1),
      'policies', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', pol.id, 'number', pol.policy_number, 'status', pol.status,
          'product_name', pr.name, 'line', pr.line,
          'inception', pol.inception_date, 'expiry', pol.expiry_date,
          'sum_covered', pol.sum_covered, 'contribution', pol.contribution, 'frequency', pol.frequency,
          'wakala', pol.wakala_fee, 'tabarru', pol.tabarru,
          'participant_name', me.full_name,
          'instalment_plan', nullif(pol.risk_payload -> 'instalmentPlan', 'null'::jsonb),
          'can_pay', private.portal_can_pay(pol),
          'agent', case when ag.id is null then null else jsonb_build_object(
            'name', ag.full_name, 'phone', ag.phone, 'slug', case when ag.is_public then ag.slug end) end
        ) order by pol.expiry_date desc)
        from pol
        join me on me.id = pol.participant_id
        join public.products pr on pr.id = pol.product_id
        left join public.agents ag on ag.id = pol.agent_id
      ), '[]'::jsonb),
      'payments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'policy_number', pol.policy_number, 'amount', pay.amount, 'status', pay.status,
          'paid_at', pay.paid_at, 'receipt', pay.receipt_number, 'method', pay.method
        ) order by pay.paid_at desc nulls last)
        from public.payments pay join pol on pol.id = pay.policy_id
      ), '[]'::jsonb),
      'claims', coalesce((
        select jsonb_agg(jsonb_build_object(
          'number', c.claim_number, 'policy_number', pol.policy_number, 'status', c.status,
          'incident_date', c.incident_date, 'reported_at', c.reported_at,
          'claimed', c.claimed_amount, 'approved', c.approved_amount, 'description', c.description
        ) order by c.reported_at desc)
        from public.claims c join pol on pol.id = c.policy_id
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.customer_pay_link(p_token text, p_policy_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := private.portal_phone(p_token);
  p public.policies%rowtype;
  v_token text;
begin
  if v_phone is null then
    raise exception 'Please sign in again' using errcode = '42501';
  end if;
  select pol.* into p from public.policies pol join public.participants pa on pa.id = pol.participant_id
   where pol.id = p_policy_id and private.norm_phone(pa.phone) = v_phone;
  if not found then
    raise exception 'Unknown policy' using errcode = '42501';
  end if;
  if not private.portal_can_pay(p) then
    raise exception 'Nothing is due on this policy right now' using errcode = '22023';
  end if;
  -- Reuse today's open link for the same policy instead of piling up new ones.
  select token into v_token from private.pay_links
   where policy_id = p.id and paid_at is null and expires_at > now() and amount = round(p.contribution)
     and created_at > now() - interval '1 day' and created_by is null
   order by created_at desc limit 1;
  if v_token is null then
    v_token := private.new_token();
    insert into private.pay_links (token, operator_id, policy_id, amount, purpose, note)
    values (v_token, p.operator_id, p.id, round(p.contribution),
            case when p.status in ('active', 'reinstated', 'expired') then 'renewal' else 'premium' end,
            case when p.status in ('active', 'reinstated', 'expired') then 'Renewal' else null end);
  end if;
  return v_token;
end;
$$;

create or replace function public.customer_claim_create(
  p_token text, p_policy_id uuid, p_incident_date date, p_description text, p_location text default null, p_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := private.portal_phone(p_token);
  p public.policies%rowtype;
  v_number text;
  v_agent record;
begin
  if v_phone is null then
    raise exception 'Please sign in again' using errcode = '42501';
  end if;
  select pol.* into p from public.policies pol join public.participants pa on pa.id = pol.participant_id
   where pol.id = p_policy_id and private.norm_phone(pa.phone) = v_phone;
  if not found then
    raise exception 'Unknown policy' using errcode = '42501';
  end if;
  if p.status not in ('active', 'reinstated') then
    raise exception 'This policy isn''t active — talk to your agent about this claim' using errcode = '22023';
  end if;
  if p_incident_date is null or p_incident_date > current_date or p_incident_date < p.inception_date then
    raise exception 'The date must be between the start of your cover and today' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_description, ''))) < 10 then
    raise exception 'Tell us what happened (at least a sentence)' using errcode = '22023';
  end if;
  if p_amount is not null and (p_amount <= 0 or p_amount > p.sum_covered) then
    raise exception 'The amount must be more than zero and no more than your cover' using errcode = '22023';
  end if;
  if (select count(*) from public.claims where policy_id = p.id and reported_at > now() - interval '1 day') >= 3 then
    raise exception 'We already have claims from today on this policy — your agent will be in touch' using errcode = 'P0001';
  end if;
  loop
    v_number := 'CLM-' || to_char(now(), 'YYYY') || '-' || lpad((floor(random() * 90000) + 10000)::text, 5, '0');
    exit when not exists (select 1 from public.claims where claim_number = v_number);
  end loop;
  insert into public.claims (operator_id, claim_number, policy_id, participant_id, status, incident_date,
                             description, incident_location, claimed_amount, sla_due_at)
  values (p.operator_id, v_number, p.id, p.participant_id, 'reported', p_incident_date,
          left(btrim(p_description), 1000), nullif(left(btrim(coalesce(p_location, '')), 200), ''),
          p_amount, now() + interval '2 days');
  select a.full_name, a.phone into v_agent from public.agents a where a.id = p.agent_id;
  return jsonb_build_object('number', v_number, 'policy_number', p.policy_number,
                            'agent_name', v_agent.full_name, 'agent_phone', v_agent.phone);
end;
$$;

create or replace function public.customer_logout(p_token text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update private.customer_sessions set expires_at = now()
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

revoke all on function private.norm_phone(text) from public, anon, authenticated;
revoke all on function private.portal_phone(text) from public, anon, authenticated;
revoke all on function private.portal_can_pay(public.policies) from public, anon, authenticated;
revoke execute on function public.customer_otp_issue(text, text, text) from public;
revoke execute on function public.customer_otp_verify(text, text) from public;
revoke execute on function public.customer_portal(text) from public;
revoke execute on function public.customer_pay_link(text, uuid) from public;
revoke execute on function public.customer_claim_create(text, uuid, date, text, text, numeric) from public;
revoke execute on function public.customer_logout(text) from public;
grant execute on function public.customer_otp_issue(text, text, text) to anon, authenticated;
grant execute on function public.customer_otp_verify(text, text) to anon, authenticated;
grant execute on function public.customer_portal(text) to anon, authenticated;
grant execute on function public.customer_pay_link(text, uuid) to anon, authenticated;
grant execute on function public.customer_claim_create(text, uuid, date, text, text, numeric) to anon, authenticated;
grant execute on function public.customer_logout(text) to anon, authenticated;
