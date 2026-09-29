-- Subs save views per builder they work with: allow any org the user can see.
drop policy saved_views_insert on public.saved_views;
create policy saved_views_insert on public.saved_views for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_see_org(org_id) and (not is_shared or private.is_member(org_id)));
