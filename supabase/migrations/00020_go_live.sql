-- Bimafy: go-live checklist. Admins see what is connected and register the server's secrets
-- with the database from the app (the server sends the values it holds in its environment;
-- only their SHA-256 is stored), instead of running SQL by hand.

-- What the checklist needs to know. p_cron_hash / p_mpesa_hash are the SHA-256 of the values the
-- server currently has, so the answer says whether the database agrees with the server.
create or replace function public.setup_status(p_cron_hash text default null, p_mpesa_hash text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_operator uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Only admins can see the go-live checklist' using errcode = '42501';
  end if;
  select operator_id into v_operator from public.profiles where id = auth.uid();
  return jsonb_build_object(
    'cron_registered', exists (select 1 from private.app_secrets where name = 'reminders_cron' and sha256 ~ '^[0-9a-f]{64}$'),
    'cron_matches', p_cron_hash is not null and exists (select 1 from private.app_secrets where name = 'reminders_cron' and sha256 = p_cron_hash),
    'mpesa_registered', exists (select 1 from private.app_secrets where name = 'mpesa_callback' and sha256 ~ '^[0-9a-f]{64}$'),
    'mpesa_matches', p_mpesa_hash is not null and exists (select 1 from private.app_secrets where name = 'mpesa_callback' and sha256 = p_mpesa_hash),
    'agents', (select count(*) from public.agents where operator_id = v_operator and status = 'active'),
    'agents_public', (select count(*) from public.agents where operator_id = v_operator and status = 'active' and is_public),
    'agents_with_phone', (select count(*) from public.agents where operator_id = v_operator and status = 'active' and phone is not null),
    'products', (select count(*) from public.products where operator_id = v_operator and is_active),
    'policies', (select count(*) from public.policies where operator_id = v_operator),
    'website_leads_30d', (select count(*) from public.leads where operator_id = v_operator and source = 'website' and created_at > now() - interval '30 days'),
    'auto_reminders_7d', (select count(*) from public.reminder_log where operator_id = v_operator and automatic and status = 'sent' and sent_at > now() - interval '7 days'),
    'last_auto_reminder', (select max(sent_at) from public.reminder_log where operator_id = v_operator and automatic and status = 'sent'),
    'failed_auto_reminders_7d', (select count(*) from public.reminder_log where operator_id = v_operator and automatic and status = 'failed' and sent_at > now() - interval '7 days'),
    'paid_pay_links_30d', (select count(*) from private.pay_links where operator_id = v_operator and paid_at > now() - interval '30 days'),
    'reviews', (select count(*) from public.agent_reviews where operator_id = v_operator and not hidden),
    'admin_phone', (select phone from public.profiles where id = auth.uid())
  );
end;
$$;

-- Store the SHA-256 of a server secret. Only admins, only the two names the app uses.
create or replace function public.admin_register_secret(p_name text, p_secret text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Only admins can connect server secrets' using errcode = '42501';
  end if;
  if p_name not in ('reminders_cron', 'mpesa_callback') then
    raise exception 'Unknown secret' using errcode = '22023';
  end if;
  if length(coalesce(p_secret, '')) < 24 then
    raise exception 'That secret is too short — use at least 24 random characters' using errcode = '22023';
  end if;
  insert into private.app_secrets (name, sha256)
  values (p_name, encode(extensions.digest(p_secret, 'sha256'), 'hex'))
  on conflict (name) do update set sha256 = excluded.sha256, updated_at = now();
  return true;
end;
$$;

revoke execute on function public.setup_status(text, text) from public, anon;
revoke execute on function public.admin_register_secret(text, text) from public, anon;
grant execute on function public.setup_status(text, text) to authenticated;
grant execute on function public.admin_register_secret(text, text) to authenticated;
