-- Company time zones: warranty appointment notifications show the builder's local time.
CREATE OR REPLACE FUNCTION private.ntf_appt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.warranty_claims; v_users uuid[];
begin
  select * into c from public.warranty_claims where id = new.claim_id;
  if tg_op = 'INSERT' then
    v_users := (select coalesce(array_agg(user_id), '{}') from public.job_clients where job_id = c.job_id and user_id is not null);
    if new.assignee_sub_org_id is not null then v_users := v_users || private.org_users(new.assignee_sub_org_id); end if;
    if new.assignee_user_id is not null then v_users := v_users || array[new.assignee_user_id]; end if;
    perform private.notify(v_users, c.org_id, c.job_id, 'warranty.updated', 'Service appointment for ' || c.title,
      to_char(new.starts_at at time zone private.org_tz(c.org_id), 'Dy Mon DD, HH12:MI AM'), '/warranty/' || c.id);
    if c.status = 'open' then
      perform set_config('app.claim_status', 'on', true);
      update public.warranty_claims set status = 'scheduled' where id = c.id;
      perform set_config('app.claim_status', 'off', true);
    end if;
  end if;
  return null;
end $function$

;
