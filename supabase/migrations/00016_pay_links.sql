-- Bimafy: M-Pesa pay links. An agent texts a client a link; the client opens it on their phone
-- and pays by STK push; the payment is recorded and the policy activated by the database itself
-- when M-Pesa confirms, so nothing depends on a browser staying open.
--
-- pay_link_create  - staff create a link for one of their agency's policies (amount fixed by staff)
-- pay_link_view    - anyone holding the unguessable token sees what they're paying for
-- pay_link_attach  - the server ties an STK push to the link
-- trigger          - when that STK request completes, insert the payment and activate the policy

create table if not exists private.pay_links (
  token text primary key,
  operator_id uuid not null references public.operators(id) on delete cascade,
  policy_id uuid not null references public.policies(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0 and amount <= 250000),
  purpose text not null default 'premium' check (purpose in ('premium', 'instalment', 'renewal')),
  phone text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  checkout_request_id text,
  paid_at timestamptz,
  payment_id uuid
);
create index if not exists pay_links_checkout_idx on private.pay_links (checkout_request_id);
create index if not exists pay_links_policy_idx on private.pay_links (policy_id, created_at desc);

create or replace function public.pay_link_create(p_policy_id uuid, p_amount numeric, p_purpose text default 'premium', p_note text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_operator uuid;
  v_phone text;
  v_token text;
begin
  if not public.is_staff() then
    raise exception 'Only agency staff can create pay links' using errcode = '42501';
  end if;
  select operator_id into v_operator from public.profiles where id = auth.uid();
  select pa.phone into v_phone
    from public.policies p join public.participants pa on pa.id = p.participant_id
   where p.id = p_policy_id and p.operator_id = v_operator;
  if not found then
    raise exception 'Unknown policy' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 250000 then
    raise exception 'Amount must be between KES 1 and KES 250,000' using errcode = '22023';
  end if;
  -- 16 random bytes, URL-safe: unguessable, short enough for an SMS.
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(16), 'base64'), '='), '+/', '-_');
  insert into private.pay_links (token, operator_id, policy_id, amount, purpose, phone, note, created_by)
  values (v_token, v_operator, p_policy_id, round(p_amount), coalesce(p_purpose, 'premium'), v_phone, left(p_note, 200), auth.uid());
  return v_token;
end;
$$;

create or replace function public.pay_link_view(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'amount', l.amount,
    'purpose', l.purpose,
    'note', l.note,
    'status', case when l.paid_at is not null then 'paid' when l.expires_at < now() then 'expired' else 'open' end,
    'paid_at', l.paid_at,
    'expires_at', l.expires_at,
    'policy_id', p.id,
    'policy_number', p.policy_number,
    'product_name', pr.name,
    'first_name', split_part(pa.full_name, ' ', 1),
    -- Masked: whoever holds the link sees whose number it is, not the whole number.
    'phone_hint', case when pa.phone is null then null else overlay(pa.phone placing '****' from greatest(length(pa.phone) - 6, 1) for 4) end,
    'has_phone', pa.phone is not null,
    'agent_name', ag.full_name,
    'checkout_request_id', l.checkout_request_id,
    'receipt', (select r.receipt from private.mpesa_requests r where r.checkout_request_id = l.checkout_request_id)
  )
  from private.pay_links l
  join public.policies p on p.id = l.policy_id
  join public.participants pa on pa.id = p.participant_id
  join public.products pr on pr.id = p.product_id
  left join public.agents ag on ag.id = p.agent_id
  where l.token = p_token;
$$;

create or replace function public.pay_link_attach(p_token text, p_checkout_request_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  -- Only an open link, and only to an STK request that was recorded for exactly its amount.
  update private.pay_links l set checkout_request_id = p_checkout_request_id
   where l.token = p_token and l.paid_at is null and l.expires_at > now()
     and exists (select 1 from private.mpesa_requests r
                  where r.checkout_request_id = p_checkout_request_id and r.amount = l.amount and r.status = 'pending');
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- When M-Pesa confirms a push that belongs to a pay link: record the payment and activate cover.
create or replace function private.settle_pay_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l private.pay_links%rowtype;
  v_payment uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;
  select * into l from private.pay_links where checkout_request_id = new.checkout_request_id and paid_at is null for update;
  if not found then
    return new;
  end if;
  insert into public.payments (operator_id, policy_id, participant_id, reference, method, status, amount, provider_ref, receipt_number, paid_at, metadata)
  select l.operator_id, l.policy_id, p.participant_id,
         'MPESA-' || coalesce(new.receipt, new.checkout_request_id), 'mpesa_stk', 'reconciled', new.amount,
         new.checkout_request_id, new.receipt, now(),
         jsonb_build_object('pay_link', true, 'purpose', l.purpose, 'mode', new.mode)
    from public.policies p where p.id = l.policy_id
  on conflict (reference) do nothing
  returning id into v_payment;
  update private.pay_links set paid_at = now(), payment_id = v_payment where token = l.token;
  update public.policies set status = 'active', updated_at = now()
   where id = l.policy_id and status in ('pending_payment', 'lapsed', 'suspended');
  return new;
end;
$$;

drop trigger if exists mpesa_requests_settle_pay_link on private.mpesa_requests;
create trigger mpesa_requests_settle_pay_link
  after update of status on private.mpesa_requests
  for each row execute function private.settle_pay_link();

revoke all on function private.settle_pay_link() from public, anon, authenticated;
revoke execute on function public.pay_link_create(uuid, numeric, text, text) from public, anon;
grant execute on function public.pay_link_create(uuid, numeric, text, text) to authenticated;
revoke execute on function public.pay_link_view(text) from public;
revoke execute on function public.pay_link_attach(text, text) from public;
grant execute on function public.pay_link_view(text) to anon, authenticated;
grant execute on function public.pay_link_attach(text, text) to anon, authenticated;
