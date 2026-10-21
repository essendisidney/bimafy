-- Bimafy: public agent profiles and genuine customer reviews (the marketplace side).
--
-- agents gain a public profile (slug, bio, languages, counties, is_public). Customers can only
-- review an agent through a one-time invite: one is created automatically when a pay link is paid,
-- and staff can send one for a policy. Everything public goes through these functions; the
-- underlying rows stay private.

alter table public.agents
  add column if not exists slug text,
  add column if not exists bio text,
  add column if not exists languages text[] not null default array['English', 'Kiswahili'],
  add column if not exists counties text[] not null default '{}',
  add column if not exists is_public boolean not null default false;

-- Readable, unique URL names: joseph-otieno, then joseph-otieno-2 if taken.
create or replace function private.agent_slug(p_name text, p_agent uuid)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  base text := trim(both '-' from regexp_replace(lower(coalesce(p_name, 'agent')), '[^a-z0-9]+', '-', 'g'));
  candidate text;
  n int := 1;
begin
  if base = '' then base := 'agent'; end if;
  candidate := base;
  while exists (select 1 from public.agents where slug = candidate and id <> p_agent) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

update public.agents set slug = private.agent_slug(full_name, id) where slug is null;
create unique index if not exists agents_slug_key on public.agents (slug);

create or replace function private.agents_set_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.slug is null then
    new.slug := private.agent_slug(new.full_name, new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists agents_set_slug on public.agents;
create trigger agents_set_slug before insert on public.agents for each row execute function private.agents_set_slug();

-- ------------------------------------------------------------------ reviews

create table if not exists private.review_invites (
  token text primary key,
  operator_id uuid not null references public.operators(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  policy_id uuid references public.policies(id) on delete set null,
  pay_link_token text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days',
  used_at timestamptz
);
create index if not exists review_invites_pay_link_idx on private.review_invites (pay_link_token);

create table if not exists public.agent_reviews (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  policy_id uuid references public.policies(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  comment text check (length(comment) <= 500),
  reviewer_name text,
  invite_token text unique,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists agent_reviews_agent_idx on public.agent_reviews (agent_id, created_at desc);
alter table public.agent_reviews enable row level security;
revoke all on public.agent_reviews from anon, authenticated;
grant select on public.agent_reviews to authenticated;
drop policy if exists agent_reviews_staff_read on public.agent_reviews;
create policy agent_reviews_staff_read on public.agent_reviews
  for select to authenticated
  using (public.is_staff() and operator_id = (select operator_id from public.profiles where id = auth.uid()));

create or replace function private.new_token()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(16), 'base64'), '='), '+/', '-_');
$$;

-- Staff ask a client to rate the agent on one of their policies.
create or replace function public.review_invite_create(p_policy_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid;
  v_agent uuid;
  v_token text;
begin
  if not public.is_staff() then
    raise exception 'Only agency staff can ask for reviews' using errcode = '42501';
  end if;
  select operator_id into v_operator from public.profiles where id = auth.uid();
  select p.agent_id into v_agent from public.policies p where p.id = p_policy_id and p.operator_id = v_operator;
  if v_agent is null then
    raise exception 'This policy has no agent to review' using errcode = '22023';
  end if;
  v_token := private.new_token();
  insert into private.review_invites (token, operator_id, agent_id, policy_id) values (v_token, v_operator, v_agent, p_policy_id);
  return v_token;
end;
$$;

create or replace function public.review_invite_view(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'status', case when i.used_at is not null then 'used' when i.expires_at < now() then 'expired' else 'open' end,
    'agent_name', a.full_name,
    'agent_slug', case when a.is_public then a.slug end,
    'first_name', split_part(pa.full_name, ' ', 1),
    'product_name', pr.name
  )
  from private.review_invites i
  join public.agents a on a.id = i.agent_id
  left join public.policies p on p.id = i.policy_id
  left join public.participants pa on pa.id = p.participant_id
  left join public.products pr on pr.id = p.product_id
  where i.token = p_token;
$$;

create or replace function public.review_submit(p_token text, p_rating int, p_comment text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  i private.review_invites%rowtype;
  v_name text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Choose 1 to 5 stars' using errcode = '22023';
  end if;
  select * into i from private.review_invites
   where token = p_token and used_at is null and expires_at > now()
   for update;
  if not found then
    raise exception 'This review link has already been used or has expired' using errcode = 'P0001';
  end if;
  select split_part(pa.full_name, ' ', 1) into v_name
    from public.policies p join public.participants pa on pa.id = p.participant_id where p.id = i.policy_id;
  insert into public.agent_reviews (operator_id, agent_id, policy_id, rating, comment, reviewer_name, invite_token)
  values (i.operator_id, i.agent_id, i.policy_id, p_rating, nullif(left(btrim(coalesce(p_comment, '')), 500), ''), v_name, p_token);
  update private.review_invites set used_at = now() where token = p_token;
  return true;
end;
$$;

-- ------------------------------------------------------------------ public directory

create or replace function private.agent_card(a public.agents)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug', a.slug,
    'name', a.full_name,
    'bio', a.bio,
    'languages', a.languages,
    'counties', case when cardinality(a.counties) > 0 then a.counties
                     else array_remove(array[(select b.county from public.branches b where b.id = a.branch_id)], null) end,
    'branch', (select b.name from public.branches b where b.id = a.branch_id),
    'licensed', a.license_number is not null,
    'since', a.created_at,
    'rating', (select round(avg(r.rating)::numeric, 1) from public.agent_reviews r where r.agent_id = a.id and not r.hidden),
    'reviews', (select count(*) from public.agent_reviews r where r.agent_id = a.id and not r.hidden)
  );
$$;

create or replace function public.public_agents()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(private.agent_card(a) order by
           (select count(*) from public.agent_reviews r where r.agent_id = a.id and not r.hidden) desc, a.full_name), '[]'::jsonb)
  from public.agents a
  where a.is_public and a.status = 'active';
$$;

create or replace function public.public_agent(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select private.agent_card(a) || jsonb_build_object(
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('name', r.reviewer_name, 'rating', r.rating, 'comment', r.comment, 'at', r.created_at)
                       order by r.created_at desc)
      from (select * from public.agent_reviews r
             where r.agent_id = a.id and not r.hidden
             order by r.created_at desc limit 20) r
    ), '[]'::jsonb)
  )
  from public.agents a
  where a.slug = p_slug and a.is_public and a.status = 'active';
$$;

-- ------------------------------------------------------------------ agents edit their own profile

create or replace function public.my_agent_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('slug', a.slug, 'bio', a.bio, 'languages', a.languages, 'counties', a.counties,
                            'is_public', a.is_public, 'name', a.full_name)
  from public.agents a where a.profile_id = auth.uid();
$$;

create or replace function public.agent_profile_update(p_bio text, p_languages text[], p_counties text[], p_is_public boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.agents where profile_id = auth.uid()) then
    raise exception 'Only agents have a public profile' using errcode = '42501';
  end if;
  update public.agents set
    bio = nullif(left(btrim(coalesce(p_bio, '')), 400), ''),
    languages = coalesce((select array_agg(left(btrim(l), 30)) from unnest(p_languages[1:6]) l where btrim(l) <> ''), '{}'),
    counties = coalesce((select array_agg(left(btrim(c), 40)) from unnest(p_counties[1:10]) c where btrim(c) <> ''), '{}'),
    is_public = coalesce(p_is_public, false)
  where profile_id = auth.uid();
  return public.my_agent_profile();
end;
$$;

-- ------------------------------------------------------------------ hook into pay links and website requests

-- Paying through a pay link also creates a review invite for the policy's agent.
create or replace function private.settle_pay_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l private.pay_links%rowtype;
  v_payment uuid;
  v_agent uuid;
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
   where id = l.policy_id and status in ('pending_payment', 'lapsed', 'suspended')
  returning agent_id into v_agent;
  if v_agent is null then
    select agent_id into v_agent from public.policies where id = l.policy_id;
  end if;
  if v_agent is not null then
    insert into private.review_invites (token, operator_id, agent_id, policy_id, pay_link_token)
    values (private.new_token(), l.operator_id, v_agent, l.policy_id, l.token);
  end if;
  return new;
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
    'phone_hint', case when pa.phone is null then null else overlay(pa.phone placing '****' from greatest(length(pa.phone) - 6, 1) for 4) end,
    'has_phone', pa.phone is not null,
    'agent_name', ag.full_name,
    'checkout_request_id', l.checkout_request_id,
    'receipt', (select r.receipt from private.mpesa_requests r where r.checkout_request_id = l.checkout_request_id),
    -- Only once paid: the one-time link to rate the agent.
    'review_token', case when l.paid_at is not null then
      (select i.token from private.review_invites i where i.pay_link_token = l.token and i.used_at is null limit 1) end
  )
  from private.pay_links l
  join public.policies p on p.id = l.policy_id
  join public.participants pa on pa.id = p.participant_id
  join public.products pr on pr.id = p.product_id
  left join public.agents ag on ag.id = p.agent_id
  where l.token = p_token;
$$;

-- Website requests can name the agent the customer chose on their profile page.
create or replace function public.request_cover(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_phone text := coalesce(p ->> 'phone', '');
  v_line text := coalesce(p ->> 'product_line', '');
  v_operator uuid;
  v_agent record;
  v_lead uuid;
begin
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Please enter your name' using errcode = '22023';
  end if;
  if v_phone !~ '^254[17][0-9]{8}$' then
    raise exception 'Enter a Kenyan mobile number (07… or 01…)' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'product_line' and e.enumlabel = v_line) then
    raise exception 'Unknown cover type' using errcode = '22023';
  end if;
  if (select count(*) from public.leads
      where phone = v_phone and source = 'website' and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'We already have your request — an agent will call you shortly' using errcode = 'P0001';
  end if;
  if (select count(*) from public.leads
      where source = 'website' and created_at > now() - interval '10 minutes') >= 60 then
    raise exception 'We are getting a lot of requests right now — please try again in a few minutes' using errcode = 'P0001';
  end if;

  -- A customer who picked an agent on their public profile gets that agent.
  select a.id, a.full_name, a.phone, a.operator_id into v_agent
    from public.agents a
   where a.slug = nullif(p ->> 'agent_slug', '') and a.is_public and a.status = 'active';
  v_operator := v_agent.operator_id;

  if v_operator is null then
    select id into v_operator from public.operators
     where id = nullif(p ->> 'operator_id', '')::uuid
    union all
    select id from (select id from public.operators order by created_at limit 1) o
    limit 1;
    if v_operator is null then
      raise exception 'No agency is set up yet' using errcode = 'P0001';
    end if;
    select a.id, a.full_name, a.phone, a.operator_id into v_agent
      from public.agents a
     where a.operator_id = v_operator and a.status = 'active'
     order by
       (select count(*) from public.leads l where l.agent_id = a.id and l.status in ('new', 'contacted', 'quoted')),
       (select max(l.created_at) from public.leads l where l.agent_id = a.id and l.source = 'website') nulls first,
       random()
     limit 1;
  end if;

  insert into public.leads (
    operator_id, agent_id, full_name, phone, product_line, status, notes,
    estimated_value, source, next_action_at, activities
  ) values (
    v_operator, v_agent.id, v_name, v_phone, v_line::product_line, 'new',
    left(coalesce(p ->> 'notes', ''), 500),
    nullif(p ->> 'annual_value', '')::numeric, 'website', current_date,
    jsonb_build_array(jsonb_build_object(
      'id', 'act-' || substr(md5(random()::text), 1, 8),
      'at', now(),
      'kind', 'note',
      'summary', left('Asked for cover on the website: ' || coalesce(p ->> 'notes', ''), 300)
    ))
  )
  returning id into v_lead;

  return jsonb_build_object('lead_id', v_lead, 'agent_name', v_agent.full_name, 'agent_phone', v_agent.phone);
end;
$$;

revoke all on function private.agent_slug(text, uuid) from public, anon, authenticated;
revoke all on function private.agents_set_slug() from public, anon, authenticated;
revoke all on function private.new_token() from public, anon, authenticated;
revoke all on function private.agent_card(public.agents) from public, anon, authenticated;
revoke execute on function public.review_invite_create(uuid) from public, anon;
grant execute on function public.review_invite_create(uuid) to authenticated;
revoke execute on function public.my_agent_profile() from public, anon;
grant execute on function public.my_agent_profile() to authenticated;
revoke execute on function public.agent_profile_update(text, text[], text[], boolean) from public, anon;
grant execute on function public.agent_profile_update(text, text[], text[], boolean) to authenticated;
revoke execute on function public.review_invite_view(text) from public;
revoke execute on function public.review_submit(text, int, text) from public;
revoke execute on function public.public_agents() from public;
revoke execute on function public.public_agent(text) from public;
grant execute on function public.review_invite_view(text) to anon, authenticated;
grant execute on function public.review_submit(text, int, text) to anon, authenticated;
grant execute on function public.public_agents() to anon, authenticated;
grant execute on function public.public_agent(text) to anon, authenticated;
