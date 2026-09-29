-- Atomic save for the estimate worksheet. Runs as the caller, so RLS applies.
create or replace function public.save_estimate(p_estimate uuid, p_settings jsonb, p_groups jsonb, p_items jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare e public.estimates;
begin
  select * into e from public.estimates where id = p_estimate;
  if e.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if e.locked_at is not null then raise exception 'This estimate is locked. Unlock it to make changes.' using errcode = '55000'; end if;

  update public.estimates set
    default_markup_pct = coalesce((p_settings->>'default_markup_pct')::numeric, default_markup_pct),
    tax_rate = coalesce((p_settings->>'tax_rate')::numeric, tax_rate),
    tax_label = coalesce(nullif(trim(p_settings->>'tax_label'), ''), tax_label)
  where id = p_estimate;

  insert into public.estimate_groups as g (id, estimate_id, name, sort, is_optional, option_status)
  select x.id, p_estimate, x.name, x.sort, coalesce(x.is_optional, false), coalesce(x.option_status, 'pending')::public.option_status
  from jsonb_to_recordset(coalesce(p_groups, '[]')) as x(id uuid, name text, sort int, is_optional boolean, option_status text)
  on conflict (id) do update set name = excluded.name, sort = excluded.sort, is_optional = excluded.is_optional, option_status = excluded.option_status
    where g.estimate_id = p_estimate;

  delete from public.estimate_items where estimate_id = p_estimate
    and id not in (select (v->>'id')::uuid from jsonb_array_elements(coalesce(p_items, '[]')) v);

  insert into public.estimate_items as i (id, estimate_id, group_id, cost_code_id, cost_type, title, description, internal_notes,
    quantity, unit, unit_cost, markup_type, markup_value, taxable, marked_as, sort)
  select x.id, p_estimate, x.group_id, x.cost_code_id, coalesce(x.cost_type, 'material')::public.cost_type, x.title, nullif(x.description, ''), nullif(x.internal_notes, ''),
    coalesce(x.quantity, 1), coalesce(nullif(x.unit, ''), 'ea'), coalesce(x.unit_cost, 0), coalesce(x.markup_type, 'percent')::public.markup_type,
    coalesce(x.markup_value, 0), coalesce(x.taxable, true), coalesce(x.marked_as, 'none')::public.marked_as, x.sort
  from jsonb_to_recordset(coalesce(p_items, '[]')) as x(id uuid, group_id uuid, cost_code_id uuid, cost_type text, title text, description text,
    internal_notes text, quantity numeric, unit text, unit_cost numeric, markup_type text, markup_value numeric, taxable boolean, marked_as text, sort int)
  on conflict (id) do update set group_id = excluded.group_id, cost_code_id = excluded.cost_code_id, cost_type = excluded.cost_type,
    title = excluded.title, description = excluded.description, internal_notes = excluded.internal_notes, quantity = excluded.quantity,
    unit = excluded.unit, unit_cost = excluded.unit_cost, markup_type = excluded.markup_type, markup_value = excluded.markup_value,
    taxable = excluded.taxable, marked_as = excluded.marked_as, sort = excluded.sort
    where i.estimate_id = p_estimate;

  delete from public.estimate_groups where estimate_id = p_estimate
    and id not in (select (v->>'id')::uuid from jsonb_array_elements(coalesce(p_groups, '[]')) v);
end $$;
revoke execute on function public.save_estimate(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_estimate(uuid, jsonb, jsonb, jsonb) to authenticated;

-- Sales reps with "own" scope only see proposals they created
drop policy proposals_select on public.proposals;
create policy proposals_select on public.proposals for select to authenticated
  using (((private.can_module(job_id, 'proposals', 'view') and (private.perm_scope(org_id, 'proposals') <> 'own' or created_by = (select auth.uid())))
         or private.can_module(job_id, 'estimates', 'view'))
      or (private.is_job_client(job_id) and status <> 'draft'));

-- Draft proposals can be deleted by users who can delete proposals or estimates
create policy proposals_delete on public.proposals for delete to authenticated
  using (status = 'draft' and (private.can_module(job_id, 'proposals', 'delete') or private.can_module(job_id, 'estimates', 'delete')));

-- Proposals remember the tax label/rate the client saw (clients can't read estimates)
alter table public.proposals add column tax_label text;
create or replace function public.release_proposal(p_proposal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.proposals; e public.estimates; v_snap jsonb; v_sub numeric; v_tax numeric;
begin
  select * into p from public.proposals where id = p_proposal for update;
  if p.id is null or not private.can_module(p.job_id, 'proposals', 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p.status <> 'draft' then raise exception 'Only drafts can be released' using errcode = '22023'; end if;
  select * into e from public.estimates where id = p.estimate_id;
  select jsonb_agg(g order by g.sort) into v_snap from (
    select coalesce(gr.id::text, 'ungrouped') id, coalesce(gr.name, 'Items') name, coalesce(gr.sort, 99999) sort,
           coalesce(gr.is_optional, false) optional,
           jsonb_agg(jsonb_build_object('title', i.title, 'description', i.description, 'quantity', i.quantity, 'unit', i.unit,
                                        'price', public.item_price(i), 'taxable', i.taxable) order by i.sort) lines,
           sum(public.item_price(i)) total
    from public.estimate_items i left join public.estimate_groups gr on gr.id = i.group_id
    where i.estimate_id = e.id and (gr.id is null or not gr.is_optional or gr.option_status <> 'declined')
    group by gr.id, gr.name, gr.sort, gr.is_optional) g;
  select coalesce(sum(public.item_price(i)), 0), coalesce(sum(case when i.taxable then public.item_price(i) end), 0) * e.tax_rate / 100
    into v_sub, v_tax
  from public.estimate_items i left join public.estimate_groups gr on gr.id = i.group_id
  where i.estimate_id = e.id and (gr.id is null or not gr.is_optional);
  update public.proposals set status = 'released', released_at = now(), snapshot = coalesce(v_snap, '[]'::jsonb),
    tax_label = e.tax_label || ' (' || trim(to_char(e.tax_rate, 'FM990.999'), '.') || '%)',
    subtotal = round(v_sub, 2), tax = round(v_tax, 2), total = round(v_sub + v_tax, 2)
  where id = p_proposal;
  -- tell the clients
  perform private.notify((select coalesce(array_agg(user_id), '{}') from public.job_clients where job_id = p.job_id and user_id is not null),
    p.org_id, p.job_id, 'proposal.released', 'Proposal ready for your review: ' || p.title, null, '/proposals/' || p.id);
end $$;

