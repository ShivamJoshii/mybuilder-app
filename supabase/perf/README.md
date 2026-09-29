# RLS performance check

`seed.sql` creates one builder with 200 jobs, 40,000 to-dos and 20,000 daily logs, plus a project manager
assigned to 20 jobs. Load it into a local database (never production), then time the list queries as each user:

```sh
psql "$DB_URL" -f supabase/perf/seed.sql
# owner: 00000000-0000-0000-0000-00000000aaaa, PM: …bbbb
```

Reference (local, after 20260929004400_rls_performance): 40k to-dos for the owner ≈ 60 ms (was 34 s);
the PM's 4k to-dos ≈ 10 ms (was 4.3 s); 1,000 to-dos with embeds through the API ≈ 0.25 s.
Run `pnpm exec supabase db reset` afterwards.
