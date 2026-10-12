-- Bimafy: agent onboarding from the app, and lock down self-service profile edits.

-- ---------------------------------------------------------------------------
-- 1. Users could update their own profile row with no column limits, so any
--    signed-in user (even a customer) could set role = 'admin' or move to
--    another operator. Only personal details stay self-editable.
-- ---------------------------------------------------------------------------
revoke update on public.profiles from authenticated, anon;
grant update (full_name, phone, date_of_birth, gender, kra_pin, national_id, locale, metadata, updated_at)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Admins and branch managers add agents without SQL or a service key.
--    Creates the login (email + one-time password the agent must change),
--    the profile and the agent record in one step.
-- ---------------------------------------------------------------------------
create or replace function public.bimafy_temp_password()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  -- 12 unambiguous characters (no 0/O, 1/l/I) so it survives being read out or typed from WhatsApp.
  select 'Bf-' || string_agg(substr('abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 55), 1), '')
  from (select extensions.gen_random_bytes(12) as b) r, generate_series(0, 11) i;
$$;

revoke execute on function public.bimafy_temp_password() from public, anon, authenticated;

create or replace function public.admin_create_agent(
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_branch_code text default null,
  p_sales_target numeric default 0
)
returns table (user_id uuid, agent_id uuid, agent_code text, email text, temp_password text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller public.profiles;
  v_email text := lower(trim(p_email));
  v_name text := nullif(trim(p_full_name), '');
  v_branch uuid;
  v_user uuid := gen_random_uuid();
  v_agent uuid;
  v_code text;
  v_next int;
  v_pw text := public.bimafy_temp_password();
begin
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null or caller.role not in ('admin', 'branch_manager') then
    raise exception 'Only admins and branch managers can add agents' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Enter the agent''s full name' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'Someone already signs in with %', v_email using errcode = '23505';
  end if;

  if nullif(trim(p_branch_code), '') is not null then
    select b.id into v_branch from public.branches b
    where b.operator_id = caller.operator_id and upper(b.code) = upper(trim(p_branch_code));
    if v_branch is null then
      raise exception 'Unknown branch %', p_branch_code using errcode = '22023';
    end if;
  end if;
  -- Branch managers can only add agents to their own branch.
  if caller.role = 'branch_manager' then
    v_branch := coalesce(caller.branch_id, v_branch);
  end if;

  -- Next free code in the AG-KE-0001 series.
  select coalesce(max((substring(a.agent_code from '^AG-KE-(\d+)$'))::int), 0) + 1 into v_next
  from public.agents a where a.agent_code ~ '^AG-KE-\d+$';
  v_code := 'AG-KE-' || lpad(v_next::text, 4, '0');

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user, is_anonymous
  ) values (
    v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
    extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'agent', 'operator_id', caller.operator_id),
    jsonb_build_object('full_name', v_name, 'must_change_password', true),
    now(), now(), '', '', '', '', false, false
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (
    v_user::text, v_user,
    jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true),
    'email', now(), now()
  );

  -- handle_new_user() created the profile; fill in what it doesn't know.
  update public.profiles p
  set full_name = v_name, phone = nullif(trim(p_phone), ''), branch_id = v_branch, updated_at = now()
  where p.id = v_user;

  insert into public.agents (operator_id, profile_id, branch_id, agent_code, full_name, phone, email, status, sales_target)
  values (caller.operator_id, v_user, v_branch, v_code, v_name, nullif(trim(p_phone), ''), v_email, 'active', coalesce(p_sales_target, 0))
  returning id into v_agent;

  return query select v_user, v_agent, v_code, v_email, v_pw;
end;
$$;

-- A new one-time password for an agent who forgot theirs (same operator only).
create or replace function public.admin_reset_agent_password(p_agent_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller public.profiles;
  target public.agents;
  v_pw text := public.bimafy_temp_password();
begin
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null or caller.role not in ('admin', 'branch_manager') then
    raise exception 'Only admins and branch managers can reset passwords' using errcode = '42501';
  end if;
  select * into target from public.agents a where a.id = p_agent_id and a.operator_id = caller.operator_id;
  if target.id is null or target.profile_id is null then
    raise exception 'Agent not found' using errcode = 'P0002';
  end if;
  if caller.role = 'branch_manager' and target.branch_id is distinct from caller.branch_id then
    raise exception 'That agent is in another branch' using errcode = '42501';
  end if;

  update auth.users u
  set encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf')),
      raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || '{"must_change_password": true}'::jsonb,
      updated_at = now()
  where u.id = target.profile_id;
  return v_pw;
end;
$$;

-- Turn an agent's access off or back on (their history stays).
create or replace function public.admin_set_agent_status(p_agent_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller public.profiles;
  target public.agents;
begin
  if p_status not in ('active', 'suspended') then
    raise exception 'Status must be active or suspended' using errcode = '22023';
  end if;
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null or caller.role not in ('admin', 'branch_manager') then
    raise exception 'Only admins and branch managers can change agent access' using errcode = '42501';
  end if;
  select * into target from public.agents a where a.id = p_agent_id and a.operator_id = caller.operator_id;
  if target.id is null then
    raise exception 'Agent not found' using errcode = 'P0002';
  end if;
  if caller.role = 'branch_manager' and target.branch_id is distinct from caller.branch_id then
    raise exception 'That agent is in another branch' using errcode = '42501';
  end if;

  update public.agents set status = p_status where id = target.id;
  -- Suspended agents can't sign in; banned_until is how Supabase Auth blocks a login.
  if target.profile_id is not null then
    update auth.users set banned_until = case when p_status = 'suspended' then now() + interval '100 years' else null end
    where id = target.profile_id;
  end if;
end;
$$;

revoke execute on function public.admin_create_agent(text, text, text, text, numeric) from public, anon;
revoke execute on function public.admin_reset_agent_password(uuid) from public, anon;
revoke execute on function public.admin_set_agent_status(uuid, text) from public, anon;
grant execute on function public.admin_create_agent(text, text, text, text, numeric) to authenticated;
grant execute on function public.admin_reset_agent_password(uuid) to authenticated;
grant execute on function public.admin_set_agent_status(uuid, text) to authenticated;
