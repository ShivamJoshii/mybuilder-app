-- Foreign keys to profiles so the API can embed names (org_members -> profiles, etc.)
alter table public.org_members  add constraint org_members_profile_fk  foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.job_managers add constraint job_managers_profile_fk foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.job_members  add constraint job_members_profile_fk  foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.job_clients  add constraint job_clients_profile_fk  foreign key (user_id) references public.profiles (id) on delete set null;
alter table public.saved_views  add constraint saved_views_profile_fk  foreign key (user_id) references public.profiles (id) on delete cascade;

-- Indexes for common filters
create index jobs_org_status_idx on public.jobs (org_id, status) where deleted_at is null;
create index job_managers_user_idx on public.job_managers (user_id);
create index cost_codes_org_idx on public.cost_codes (org_id, category_id);
