-- Bimafy: reminders carry a pay link, so a customer pays from the SMS instead of replying YES
-- and waiting for an agent.
--
-- Links are reused: an open, unpaid link for the same policy and amount (made in the last 7 days)
-- is handed out again, so a customer reminded twice gets one link, not two.

create or replace function private.pay_link_for(
  p_operator uuid, p_policy_id uuid, p_amount numeric, p_purpose text, p_note text, p_created_by uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric := round(p_amount);
  v_token text;
begin
  if v_amount is null or v_amount < 1 or v_amount > 250000 then
    raise exception 'Amount must be between KES 1 and KES 250,000' using errcode = '22023';
  end if;
  select token into v_token from private.pay_links
   where policy_id = p_policy_id and amount = v_amount and paid_at is null
     and expires_at > now() + interval '2 days' and created_at > now() - interval '7 days'
   order by created_at desc limit 1;
  if v_token is null then
    v_token := private.new_token();
    insert into private.pay_links (token, operator_id, policy_id, amount, purpose, phone, note, created_by)
    select v_token, p_operator, p_policy_id, v_amount, coalesce(p_purpose, 'premium'), pa.phone, left(p_note, 200), p_created_by
      from public.policies p join public.participants pa on pa.id = p.participant_id
     where p.id = p_policy_id;
  end if;
  return v_token;
end;
$$;
revoke all on function private.pay_link_for(uuid, uuid, numeric, text, text, uuid) from public, anon, authenticated;

-- Staff: same checks as before, now reusing an open link.
create or replace function public.pay_link_create(p_policy_id uuid, p_amount numeric, p_purpose text default 'premium', p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid;
begin
  if not public.is_staff() then
    raise exception 'Only agency staff can create pay links' using errcode = '42501';
  end if;
  select operator_id into v_operator from public.profiles where id = auth.uid();
  if not exists (select 1 from public.policies where id = p_policy_id and operator_id = v_operator) then
    raise exception 'Unknown policy' using errcode = '42501';
  end if;
  return private.pay_link_for(v_operator, p_policy_id, p_amount, p_purpose, p_note, auth.uid());
end;
$$;

-- The 8am run (server secret): a link for the reminder it is about to send.
create or replace function public.reminders_pay_link(p_secret text, p_policy_id uuid, p_amount numeric, p_purpose text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid;
begin
  if not private.reminders_secret_ok(p_secret) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  select operator_id into v_operator from public.policies where id = p_policy_id;
  if v_operator is null then
    raise exception 'Unknown policy' using errcode = '22023';
  end if;
  return private.pay_link_for(v_operator, p_policy_id, p_amount, p_purpose, p_note, null);
end;
$$;

revoke execute on function public.reminders_pay_link(text, uuid, numeric, text, text) from public;
grant execute on function public.reminders_pay_link(text, uuid, numeric, text, text) to anon, authenticated;
