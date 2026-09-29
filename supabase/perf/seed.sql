-- perf seed: one builder with 200 jobs, 40k to-dos, 20k logs, a PM on 20 jobs
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'perf-owner@test.test', '{}', now(), now()),
       ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'perf-pm@test.test', '{}', now(), now());
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aaaa","role":"authenticated"}', false);
create temp table perf (k text primary key, v uuid);
insert into perf select 'org', public.create_builder_org('Perf Homes');
insert into public.jobs (org_id, title, status) select (select v from perf where k='org'), 'Job ' || g, 'open' from generate_series(1,200) g;
insert into public.org_members (org_id, user_id, role_id, all_jobs)
  select (select v from perf where k='org'), '00000000-0000-0000-0000-00000000bbbb', (select id from roles where org_id=(select v from perf where k='org') and template_key='project_manager'), false;
insert into public.job_members (job_id, user_id) select id, '00000000-0000-0000-0000-00000000bbbb' from public.jobs where org_id=(select v from perf where k='org') order by title limit 20;
select set_config('app.quiet', 'on', false);
insert into public.todos (org_id, job_id, title, due_at) select j.org_id, j.id, 'Todo ' || g, now() + (g || ' hours')::interval from public.jobs j, generate_series(1,200) g where j.org_id=(select v from perf where k='org');
insert into public.daily_logs (org_id, job_id, notes, status) select j.org_id, j.id, 'Log ' || g, 'published' from public.jobs j, generate_series(1,100) g where j.org_id=(select v from perf where k='org');
analyze;
