-- Bimafy: "Get covered" on the public website becomes a lead for a real agent.
--
-- request_cover(p) is callable without signing in. It checks the request, throttles abuse
-- (the website then texts the client and the agent, so every request costs SMS credit),
-- picks the active agent with the fewest open leads, and files the lead in their pipeline.

create index if not exists leads_phone_created_idx on public.leads (phone, created_at desc);
create index if not exists leads_source_created_idx on public.leads (source, created_at desc);

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

  -- One person can ask a few times a day; the whole site a few hundred times an hour.
  if (select count(*) from public.leads
      where phone = v_phone and source = 'website' and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'We already have your request — an agent will call you shortly' using errcode = 'P0001';
  end if;
  if (select count(*) from public.leads
      where source = 'website' and created_at > now() - interval '10 minutes') >= 60 then
    raise exception 'We are getting a lot of requests right now — please try again in a few minutes' using errcode = 'P0001';
  end if;

  select id into v_operator from public.operators
   where id = nullif(p ->> 'operator_id', '')::uuid
  union all
  select id from (select id from public.operators order by created_at limit 1) o
  limit 1;
  if v_operator is null then
    raise exception 'No agency is set up yet' using errcode = 'P0001';
  end if;

  -- Fairest first: fewest open leads, then whoever has waited longest for a website lead.
  select a.id, a.full_name, a.phone into v_agent
    from public.agents a
   where a.operator_id = v_operator and a.status = 'active'
   order by
     (select count(*) from public.leads l where l.agent_id = a.id and l.status in ('new', 'contacted', 'quoted')),
     (select max(l.created_at) from public.leads l where l.agent_id = a.id and l.source = 'website') nulls first,
     random()
   limit 1;

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

  return jsonb_build_object(
    'lead_id', v_lead,
    'agent_name', v_agent.full_name,
    'agent_phone', v_agent.phone
  );
end;
$$;

revoke execute on function public.request_cover(jsonb) from public;
grant execute on function public.request_cover(jsonb) to anon, authenticated;
