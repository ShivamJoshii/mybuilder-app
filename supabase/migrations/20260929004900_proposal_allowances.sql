-- Proposals show which lines are allowances (estimate items "marked as" allowance / bid / selection).
drop function if exists public.estimate_price_lines(uuid);
create function public.estimate_price_lines(p_estimate uuid)
returns table (id uuid, group_id uuid, title text, description text, quantity numeric, unit text, price numeric, taxable boolean, sort integer, marked_as public.marked_as)
language sql stable security definer set search_path = '' as $$
  select i.id, i.group_id, i.title, i.description, i.quantity, i.unit, public.item_price(i), i.taxable, i.sort, i.marked_as
  from public.estimate_items i join public.estimates e on e.id = i.estimate_id
  where i.estimate_id = p_estimate and private.can_module(e.job_id, 'estimates', 'view') and private.has_perm(e.org_id, 'estimates', 'price')
  order by i.sort;
$$;
grant execute on function public.estimate_price_lines(uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.release_proposal(p_proposal uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                                        'price', public.item_price(i), 'taxable', i.taxable, 'marked_as', i.marked_as) order by i.sort) lines,
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
end $function$

;
