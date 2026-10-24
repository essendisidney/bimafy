-- Bimafy: agents apply to join from the public website (/agents/join) and admins approve them
-- from the Team page. Approving creates the login exactly like "Add an agent" (admin_create_agent),
-- so an approved agent can be selling within minutes.
--
-- The licence number an applicant types is only copied onto the agent (which shows the
-- "Licensed agent" badge publicly) when the approving admin says they checked it.

create table if not exists public.agent_applications (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete cascade,
  full_name text not null,
  phone text not null,
  email text not null,
  county text,
  license_number text,
  years_experience int,
  lines text[] not null default '{}',
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decline_reason text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  agent_id uuid references public.agents(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists agent_applications_operator_idx on public.agent_applications (operator_id, status, created_at desc);
create index if not exists agent_applications_phone_idx on public.agent_applications (phone, created_at desc);

-- Only reachable through the functions below.
alter table public.agent_applications enable row level security;
revoke all on public.agent_applications from anon, authenticated;

-- ------------------------------------------------------------------ apply (no sign-in)

create or replace function public.agent_apply(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p ->> 'name', '')), '\s+', ' ', 'g');
  v_phone text := coalesce(p ->> 'phone', '');
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
  v_county text := nullif(left(btrim(coalesce(p ->> 'county', '')), 40), '');
  v_license text := nullif(left(upper(btrim(coalesce(p ->> 'license_number', ''))), 40), '');
  v_years int;
  v_lines text[];
  v_operator uuid;
  v_id uuid;
begin
  if length(v_name) < 3 or length(v_name) > 80 or v_name !~ ' ' then
    raise exception 'Enter your first and last name' using errcode = '22023';
  end if;
  if v_phone !~ '^254[17][0-9]{8}$' then
    raise exception 'Enter a Kenyan mobile number (07… or 01…)' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 120 then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  begin
    v_years := nullif(p ->> 'years_experience', '')::int;
  exception when others then
    v_years := null;
  end;
  if v_years is not null and (v_years < 0 or v_years > 60) then
    v_years := null;
  end if;
  select coalesce(array_agg(distinct l), '{}') into v_lines
    from jsonb_array_elements_text(case when jsonb_typeof(p -> 'lines') = 'array' then p -> 'lines' else '[]'::jsonb end) l
   where l in (select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'product_line');

  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'You already have a Bimafy login with that email — sign in instead' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.agent_applications
              where (phone = v_phone or lower(email) = v_email) and status = 'pending') then
    raise exception 'We already have your application — we''ll be in touch soon' using errcode = 'P0001';
  end if;
  if (select count(*) from public.agent_applications where phone = v_phone and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'Please try again tomorrow' using errcode = 'P0001';
  end if;
  if (select count(*) from public.agent_applications where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'We are getting a lot of applications right now — please try again in a few minutes' using errcode = 'P0001';
  end if;

  select id into v_operator from public.operators
   where id = nullif(p ->> 'operator_id', '')::uuid
  union all
  select id from (select id from public.operators order by created_at limit 1) o
  limit 1;
  if v_operator is null then
    raise exception 'No agency is set up yet' using errcode = 'P0001';
  end if;

  insert into public.agent_applications (operator_id, full_name, phone, email, county, license_number, years_experience, lines, message)
  values (v_operator, v_name, v_phone, v_email, v_county, v_license, v_years, v_lines,
          nullif(left(btrim(coalesce(p ->> 'message', '')), 500), ''))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

-- ------------------------------------------------------------------ review (admins, branch managers)

create or replace function private.application_reviewer()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller public.profiles;
begin
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null or caller.role not in ('admin', 'branch_manager') then
    raise exception 'Only admins and branch managers can review agent applications' using errcode = '42501';
  end if;
  return caller;
end;
$$;

create or replace function public.agent_applications_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller public.profiles := private.application_reviewer();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.full_name, 'phone', a.phone, 'email', a.email, 'county', a.county,
      'license_number', a.license_number, 'years_experience', a.years_experience, 'lines', a.lines,
      'message', a.message, 'status', a.status, 'decline_reason', a.decline_reason,
      'created_at', a.created_at, 'decided_at', a.decided_at
    ) order by (a.status = 'pending') desc, a.created_at desc)
    from (select * from public.agent_applications
           where operator_id = caller.operator_id
             and (status = 'pending' or decided_at > now() - interval '30 days')
           order by created_at desc limit 200) a
  ), '[]'::jsonb);
end;
$$;

-- Approve (creates the agent and their login) or decline. Returns what the server needs to
-- text the applicant; the one-time password is returned once, here, and never stored.
create or replace function public.agent_application_decide(
  p_id uuid, p_approve boolean, p_license_checked boolean default false,
  p_branch_code text default null, p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller public.profiles := private.application_reviewer();
  app public.agent_applications;
  r record;
begin
  select * into app from public.agent_applications
   where id = p_id and operator_id = caller.operator_id
   for update;
  if app.id is null then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;
  if app.status <> 'pending' then
    raise exception 'This application was already %', app.status using errcode = 'P0001';
  end if;

  if not coalesce(p_approve, false) then
    update public.agent_applications
       set status = 'declined', decline_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), ''),
           decided_by = auth.uid(), decided_at = now()
     where id = app.id;
    return jsonb_build_object('status', 'declined', 'name', app.full_name, 'phone', app.phone);
  end if;

  select * into r from public.admin_create_agent(app.full_name, app.email, app.phone, p_branch_code, 0);
  update public.agents
     set license_number = case when coalesce(p_license_checked, false) then app.license_number else license_number end,
         counties = case when app.county is not null then array[app.county] else counties end,
         languages = case when coalesce(cardinality(languages), 0) = 0 then array['English', 'Kiswahili'] else languages end
   where id = r.agent_id;
  update public.agent_applications
     set status = 'approved', agent_id = r.agent_id, decided_by = auth.uid(), decided_at = now()
   where id = app.id;
  return jsonb_build_object(
    'status', 'approved', 'name', app.full_name, 'phone', app.phone,
    'email', r.email, 'agent_code', r.agent_code, 'agent_id', r.agent_id, 'temp_password', r.temp_password
  );
end;
$$;

revoke all on function private.application_reviewer() from public, anon, authenticated;
revoke execute on function public.agent_apply(jsonb) from public;
revoke execute on function public.agent_applications_list() from public, anon;
revoke execute on function public.agent_application_decide(uuid, boolean, boolean, text, text) from public, anon;
grant execute on function public.agent_apply(jsonb) to anon, authenticated;
grant execute on function public.agent_applications_list() to authenticated;
grant execute on function public.agent_application_decide(uuid, boolean, boolean, text, text) to authenticated;
