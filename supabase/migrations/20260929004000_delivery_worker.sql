-- Outbox worker support: the /api/cron/deliver route (service role) claims queued email deliveries,
-- sends them, and records the outcome. Text and push stay "skipped" until Twilio / web push are set up.

alter table public.notification_deliveries add column claimed_at timestamptz;

create or replace function public.claim_deliveries(p_limit int default 50)
returns table (delivery_id uuid, channel public.delivery_channel, email text, first_name text, org_name text, title text, body text, link text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  -- channels we can't send yet
  update public.notification_deliveries set status = 'skipped', last_error = 'channel not configured'
   where status = 'queued' and channel in ('text', 'push') and created_at < now() - interval '1 minute';
  return query
  with c as (
    select d.id from public.notification_deliveries d
    where d.status = 'queued' and d.channel = 'email' and d.attempts < 5
      and (d.claimed_at is null or d.claimed_at < now() - interval '5 minutes')
    order by d.created_at limit greatest(1, least(p_limit, 200))
    for update skip locked
  ), u as (
    update public.notification_deliveries d set claimed_at = now(), attempts = d.attempts + 1 from c where d.id = c.id returning d.id, d.notification_id, d.channel
  )
  select u.id, u.channel, au.email::text, p.first_name, o.name, n.title, n.body, n.link, n.created_at
  from u join public.notifications n on n.id = u.notification_id
  join auth.users au on au.id = n.user_id
  left join public.profiles p on p.id = n.user_id
  left join public.organizations o on o.id = n.org_id;
end $$;

create or replace function public.finish_delivery(p_id uuid, p_status public.delivery_status, p_error text default null)
returns void language sql security definer set search_path = '' as $$
  update public.notification_deliveries
     set status = case when p_status = 'failed' and attempts < 5 then 'queued'::public.delivery_status else p_status end,
         sent_at = case when p_status = 'sent' then now() end, last_error = left(p_error, 500), claimed_at = null
   where id = p_id;
$$;

revoke execute on function public.claim_deliveries(int) from public, anon, authenticated;
revoke execute on function public.finish_delivery(uuid, public.delivery_status, text) from public, anon, authenticated;
grant execute on function public.claim_deliveries(int) to service_role;
grant execute on function public.finish_delivery(uuid, public.delivery_status, text) to service_role;
