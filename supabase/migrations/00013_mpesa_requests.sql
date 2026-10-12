-- Bimafy: M-Pesa STK requests that survive serverless restarts and can't be faked.
--
-- Before: requests lived in one server instance's memory (lost between Vercel
-- invocations), the status endpoint listed every customer's phone and payment,
-- and any POST to the callback URL could mark a payment as paid.
--
-- Now: requests live in a private table no client can read or write directly.
-- The app talks to it only through these functions:
--   mpesa_record_request  - after an STK push is accepted (anyone; new rows start pending)
--   mpesa_request_status  - look up ONE request by its unguessable CheckoutRequestID
--   mpesa_apply_result    - mark paid/failed; requires the server's callback secret
--   mpesa_simulate_result - demo mode only (no Daraja keys): completes simulated rows

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.mpesa_requests (
  checkout_request_id text primary key,
  merchant_request_id text,
  mode text not null check (mode in ('live', 'sandbox_simulated')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  phone text not null,
  amount numeric(14, 2) not null check (amount > 0),
  account_reference text not null,
  policy_id text,
  policy_number text,
  participant_id text,
  participant_name text,
  operator_id uuid,
  created_by uuid,
  receipt text,
  result_code int,
  result_desc text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists mpesa_requests_created_idx on private.mpesa_requests (created_at desc);

-- One-row-per-name secrets; only the SHA-256 is stored, the value lives in the server env.
create table if not exists private.app_secrets (
  name text primary key,
  sha256 text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.mpesa_record_request(p jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if coalesce(p ->> 'checkout_request_id', '') = '' or coalesce((p ->> 'amount')::numeric, 0) <= 0 then
    raise exception 'checkout_request_id and a positive amount are required' using errcode = '22023';
  end if;
  insert into private.mpesa_requests (
    checkout_request_id, merchant_request_id, mode, phone, amount, account_reference,
    policy_id, policy_number, participant_id, participant_name, operator_id, created_by
  ) values (
    p ->> 'checkout_request_id', p ->> 'merchant_request_id',
    coalesce(p ->> 'mode', 'live'), coalesce(p ->> 'phone', ''), (p ->> 'amount')::numeric,
    coalesce(p ->> 'account_reference', ''),
    nullif(p ->> 'policy_id', ''), nullif(p ->> 'policy_number', ''),
    nullif(p ->> 'participant_id', ''), nullif(p ->> 'participant_name', ''),
    (select operator_id from public.profiles where id = auth.uid()), auth.uid()
  )
  on conflict (checkout_request_id) do nothing;
end;
$$;

create or replace function public.mpesa_request_status(p_checkout_request_id text)
returns table (
  checkout_request_id text, merchant_request_id text, mode text, status text, phone text, amount numeric,
  account_reference text, policy_id text, policy_number text, participant_id text, participant_name text,
  receipt text, result_desc text, created_at timestamptz, last_checked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.checkout_request_id, r.merchant_request_id, r.mode, r.status,
         -- Masked: the status poll shouldn't hand a customer's full number to whoever holds the id.
         overlay(r.phone placing '****' from greatest(length(r.phone) - 6, 1) for 4),
         r.amount, r.account_reference, r.policy_id, r.policy_number, r.participant_id, r.participant_name,
         r.receipt, r.result_desc, r.created_at, r.last_checked_at
  from private.mpesa_requests r
  where r.checkout_request_id = p_checkout_request_id;
$$;

create or replace function public.mpesa_apply_result(
  p_secret text,
  p_checkout_request_id text,
  p_success boolean,
  p_result_code int,
  p_result_desc text,
  p_receipt text default null,
  p_amount numeric default null,
  p_phone text default null,
  p_merchant_request_id text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_status text := case when p_success then 'completed' else 'failed' end;
  v_current text;
begin
  if not exists (
    select 1 from private.app_secrets s
    where s.name = 'mpesa_callback' and s.sha256 = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
  ) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select r.status into v_current from private.mpesa_requests r where r.checkout_request_id = p_checkout_request_id for update;
  if v_current is null then
    -- Callback for a request we never recorded (e.g. recorded on a failed instance): keep it for reconciliation.
    insert into private.mpesa_requests (checkout_request_id, merchant_request_id, mode, status, phone, amount, account_reference,
      receipt, result_code, result_desc, completed_at)
    values (p_checkout_request_id, p_merchant_request_id, 'live', v_status, coalesce(p_phone, ''), greatest(coalesce(p_amount, 1), 1), '',
      p_receipt, p_result_code, p_result_desc, case when p_success then now() end);
    return v_status;
  end if;
  -- First final answer wins; Safaricom retries and our own status checks must not flip it.
  if v_current <> 'pending' then
    return v_current;
  end if;
  update private.mpesa_requests r set
    status = v_status,
    receipt = coalesce(p_receipt, r.receipt),
    result_code = p_result_code,
    result_desc = p_result_desc,
    amount = coalesce(p_amount, r.amount),
    completed_at = case when p_success then now() end,
    updated_at = now()
  where r.checkout_request_id = p_checkout_request_id;
  return v_status;
end;
$$;

-- Demo mode (no Daraja keys): a simulated request "succeeds" 8 seconds after it was sent.
create or replace function public.mpesa_simulate_result(p_checkout_request_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r private.mpesa_requests;
begin
  select * into r from private.mpesa_requests m where m.checkout_request_id = p_checkout_request_id for update;
  if r.checkout_request_id is null then return null; end if;
  if r.mode <> 'sandbox_simulated' or r.status <> 'pending' or r.created_at > now() - interval '8 seconds' then
    return r.status;
  end if;
  update private.mpesa_requests m set
    status = 'completed',
    receipt = 'SIM' || lpad((floor(random() * 900000) + 100000)::int::text, 6, '0'),
    result_code = 0,
    result_desc = 'The service request is processed successfully (simulated).',
    completed_at = now(),
    updated_at = now()
  where m.checkout_request_id = p_checkout_request_id;
  return 'completed';
end;
$$;

-- Throttle for asking Safaricom directly (STK Query) when a callback is late.
create or replace function public.mpesa_mark_checked(p_checkout_request_id text)
returns boolean
language sql
security definer
set search_path = public
as $$
  update private.mpesa_requests r set last_checked_at = now()
  where r.checkout_request_id = p_checkout_request_id
    and r.status = 'pending'
    and (r.last_checked_at is null or r.last_checked_at < now() - interval '10 seconds')
  returning true;
$$;

revoke execute on function public.mpesa_record_request(jsonb) from public;
revoke execute on function public.mpesa_request_status(text) from public;
revoke execute on function public.mpesa_apply_result(text, text, boolean, int, text, text, numeric, text, text) from public;
revoke execute on function public.mpesa_simulate_result(text) from public;
revoke execute on function public.mpesa_mark_checked(text) from public;
grant execute on function public.mpesa_record_request(jsonb) to anon, authenticated;
grant execute on function public.mpesa_request_status(text) to anon, authenticated;
grant execute on function public.mpesa_apply_result(text, text, boolean, int, text, text, numeric, text, text) to anon, authenticated;
grant execute on function public.mpesa_simulate_result(text) to anon, authenticated;
grant execute on function public.mpesa_mark_checked(text) to anon, authenticated;

-- The callback secret's hash is set separately (never committed):
--   insert into private.app_secrets (name, sha256)
--   values ('mpesa_callback', encode(extensions.digest('<MPESA_CALLBACK_SECRET>', 'sha256'), 'hex'))
--   on conflict (name) do update set sha256 = excluded.sha256, updated_at = now();
