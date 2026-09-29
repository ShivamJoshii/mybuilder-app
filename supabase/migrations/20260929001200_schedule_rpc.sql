-- Apply a batch of date changes in one transaction, tagging the shift log with a reason.
-- Runs as the caller (RLS applies to every row).
create or replace function public.apply_schedule_changes(p_changes jsonb, p_reason text default null, p_notes text default null, p_cascaded_ids uuid[] default '{}')
returns int language plpgsql security invoker set search_path = '' as $$
declare c jsonb; n int := 0; v_rows int;
begin
  perform set_config('app.shift_reason', coalesce(p_reason, ''), true);
  perform set_config('app.shift_notes', coalesce(p_notes, ''), true);
  for c in select * from jsonb_array_elements(p_changes) loop
    perform set_config('app.shift_cascaded', case when (c ->> 'id')::uuid = any (p_cascaded_ids) then 'on' else 'off' end, true);
    update public.schedule_items
       set start_date = (c ->> 'start_date')::date, end_date = (c ->> 'end_date')::date,
           duration = coalesce((c ->> 'duration')::int, duration)
     where id = (c ->> 'id')::uuid;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'Not allowed to move %', c ->> 'id' using errcode = '42501'; end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.apply_schedule_changes(jsonb, text, text, uuid[]) from public, anon;
grant execute on function public.apply_schedule_changes(jsonb, text, text, uuid[]) to authenticated;
