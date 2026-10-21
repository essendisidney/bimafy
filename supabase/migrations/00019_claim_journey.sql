-- Bimafy: the claim journey. Customers add photos to their claim from /my, staff see them, and
-- every step staff take on a claim is recorded once so the customer is texted once per step.
--
-- Photos live in a private storage bucket. Customers aren't database users, so an upload is
-- allowed only into a single-use slot issued by customer_claim_upload_slot (session-checked);
-- staff read photos with short-lived signed URLs.

-- ------------------------------------------------------------------ storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('claim-photos', 'claim-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists private.claim_upload_slots (
  path text primary key,
  claim_id uuid not null references public.claims(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  used_at timestamptz
);

-- Used by the storage policy below: may this (anonymous) upload go to this path?
create or replace function public.claim_slot_open(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from private.claim_upload_slots s
    where s.path = p_path and s.used_at is null and s.expires_at > now()
  );
$$;
revoke all on function public.claim_slot_open(text) from public;
grant execute on function public.claim_slot_open(text) to anon, authenticated;

drop policy if exists claim_photos_slot_upload on storage.objects;
create policy claim_photos_slot_upload on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'claim-photos' and public.claim_slot_open(name));

drop policy if exists claim_photos_staff_read on storage.objects;
create policy claim_photos_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'claim-photos' and public.is_staff());

-- ------------------------------------------------------------------ customer side

create or replace function private.portal_claim(p_token text, p_claim_number text)
returns public.claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := private.portal_phone(p_token);
  c public.claims%rowtype;
begin
  if v_phone is null then
    raise exception 'Please sign in again' using errcode = '42501';
  end if;
  select cl.* into c from public.claims cl join public.participants pa on pa.id = cl.participant_id
   where cl.claim_number = p_claim_number and private.norm_phone(pa.phone) = v_phone;
  if not found then
    raise exception 'Unknown claim' using errcode = '42501';
  end if;
  return c;
end;
$$;

-- A single-use place to upload one photo for one of the customer's own open claims.
create or replace function public.customer_claim_upload_slot(p_token text, p_claim_number text, p_ext text default 'jpg')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.claims := private.portal_claim(p_token, p_claim_number);
  v_path text;
begin
  if c.status in ('paid', 'closed', 'rejected') then
    raise exception 'This claim is finished — talk to your agent' using errcode = '22023';
  end if;
  if (select count(*) from public.claim_documents where claim_id = c.id and doc_type = 'customer_photo')
     + (select count(*) from private.claim_upload_slots where claim_id = c.id and used_at is null and expires_at > now()) >= 8 then
    raise exception 'That''s the most photos we can take on one claim (8)' using errcode = 'P0001';
  end if;
  v_path := c.id || '/' || gen_random_uuid() || '.' ||
            case lower(coalesce(p_ext, 'jpg')) when 'png' then 'png' when 'webp' then 'webp' else 'jpg' end;
  insert into private.claim_upload_slots (path, claim_id) values (v_path, c.id);
  return v_path;
end;
$$;

-- After the upload: record the photo against the claim (only if the file really arrived).
create or replace function public.customer_claim_photo_done(p_token text, p_claim_number text, p_path text)
returns int
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  c public.claims := private.portal_claim(p_token, p_claim_number);
begin
  update private.claim_upload_slots set used_at = now()
   where path = p_path and claim_id = c.id and used_at is null;
  if not found then
    raise exception 'Upload expired — please try again' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'claim-photos' and o.name = p_path) then
    raise exception 'The photo didn''t arrive — please try again' using errcode = 'P0001';
  end if;
  insert into public.claim_documents (claim_id, doc_type, file_url) values (c.id, 'customer_photo', p_path);
  -- A claim waiting on documents moves back to review once the customer sends something.
  update public.claims set status = 'under_review' where id = c.id and status = 'documents_pending';
  return (select count(*)::int from public.claim_documents where claim_id = c.id and doc_type = 'customer_photo');
end;
$$;

-- ------------------------------------------------------------------ status updates

create table if not exists public.claim_updates (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  status text not null,
  note text,
  notified boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (claim_id, status)
);
alter table public.claim_updates enable row level security;
revoke all on public.claim_updates from anon, authenticated;
grant select on public.claim_updates to authenticated;
drop policy if exists claim_updates_staff_read on public.claim_updates;
create policy claim_updates_staff_read on public.claim_updates
  for select to authenticated using (public.is_staff());

-- Staff record that a claim reached a step. Returns what the SMS needs, or null when this step
-- was already recorded (so the customer is never texted twice for the same step).
create or replace function public.claim_step(p_claim_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid;
  r record;
begin
  if not public.is_staff() then
    raise exception 'Only agency staff can update claims' using errcode = '42501';
  end if;
  select operator_id into v_operator from public.profiles where id = auth.uid();
  select c.id, c.claim_number, c.approved_amount, c.claimed_amount, pa.full_name, pa.phone, pol.policy_number, ag.full_name as agent_name
    into r
    from public.claims c
    join public.participants pa on pa.id = c.participant_id
    join public.policies pol on pol.id = c.policy_id
    left join public.agents ag on ag.id = pol.agent_id
   where c.id = p_claim_id and c.operator_id = v_operator;
  if not found then
    raise exception 'Unknown claim' using errcode = '42501';
  end if;
  insert into public.claim_updates (claim_id, status, note, created_by)
  values (p_claim_id, left(p_status, 40), left(p_note, 300), auth.uid())
  on conflict (claim_id, status) do nothing;
  if not found then
    return null;
  end if;
  return jsonb_build_object('number', r.claim_number, 'first_name', split_part(r.full_name, ' ', 1), 'phone', r.phone,
                            'policy_number', r.policy_number, 'approved', r.approved_amount, 'claimed', r.claimed_amount,
                            'agent_name', r.agent_name);
end;
$$;

create or replace function public.claim_step_notified(p_claim_id uuid, p_status text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.claim_updates set notified = true
   where claim_id = p_claim_id and status = p_status and public.is_staff();
$$;

-- The customer portal also shows each claim's steps and photo count.
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
          'claimed', c.claimed_amount, 'approved', c.approved_amount, 'description', c.description,
          'photos', (select count(*) from public.claim_documents d where d.claim_id = c.id and d.doc_type = 'customer_photo'),
          'steps', coalesce((select jsonb_agg(jsonb_build_object('status', u.status, 'at', u.created_at) order by u.created_at)
                             from public.claim_updates u where u.claim_id = c.id), '[]'::jsonb)
        ) order by c.reported_at desc)
        from public.claims c join pol on pol.id = c.policy_id
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function private.portal_claim(text, text) from public, anon, authenticated;
revoke execute on function public.customer_claim_upload_slot(text, text, text) from public;
revoke execute on function public.customer_claim_photo_done(text, text, text) from public;
revoke execute on function public.claim_step(uuid, text, text) from public, anon;
revoke execute on function public.claim_step_notified(uuid, text) from public, anon;
grant execute on function public.customer_claim_upload_slot(text, text, text) to anon, authenticated;
grant execute on function public.customer_claim_photo_done(text, text, text) to anon, authenticated;
grant execute on function public.claim_step(uuid, text, text) to authenticated;
grant execute on function public.claim_step_notified(uuid, text) to authenticated;
