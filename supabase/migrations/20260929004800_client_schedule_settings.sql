-- Wire the client-portal schedule settings: "none" hides the schedule, "phases" shows items the builder marked
-- for the client, "all" shows every item; and only items starting within schedule_days_ahead appear.
create or replace function private.schedule_item_visible(p_id uuid, p_job uuid, p_show_subs boolean, p_show_client boolean, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_deleted is null and (
    private.can_module(p_job, 'schedule', 'view')
    or (private.schedule_online(p_job) and private.is_job_sub(p_job) and (
          private.is_schedule_assignee(p_id)
          or (p_show_subs and exists (
                select 1 from public.job_subs js join public.org_members m on m.org_id = js.sub_org_id
                where js.job_id = p_job and js.see_all_schedule_items and m.user_id = auth.uid() and m.status = 'active'))))
    or (private.schedule_online(p_job) and private.is_job_client(p_job)
        and coalesce(private.client_setting(p_job, 'schedule') #>> '{}', 'phases') <> 'none'
        and (p_show_client or coalesce(private.client_setting(p_job, 'schedule') #>> '{}', 'phases') = 'all')
        and (select i.start_date from public.schedule_items i where i.id = p_id)
            <= (now() at time zone private.org_tz(private.job_org(p_job)))::date
               + coalesce((private.client_setting(p_job, 'schedule_days_ahead') #>> '{}')::int, 30)));
$$;
