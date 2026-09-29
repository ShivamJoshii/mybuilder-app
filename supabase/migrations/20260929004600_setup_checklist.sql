-- "Getting started" checklist on the builder's summary can be dismissed once for the company
alter table public.organizations add column setup_dismissed_at timestamptz;
