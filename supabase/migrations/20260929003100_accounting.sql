-- Accounting export settings (until QuickBooks Online / Xero sync is connected):
-- how MyBuilder cost types map to the builder's chart of accounts.
create table public.accounting_settings (
  org_id            uuid primary key references public.organizations (id) on delete cascade,
  system            text not null default 'qbo' check (system in ('qbo', 'xero', 'sage', 'other')),
  income_item       text not null default 'Construction services',
  accounts          jsonb not null default '{"labor":"Job Labour","material":"Job Materials","subcontractor":"Subcontractors","equipment":"Equipment Rental","other":"Job Expenses","none":"Job Expenses"}',
  code_accounts     jsonb not null default '{}',     -- cost_code_id → account name (overrides)
  updated_at        timestamptz not null default now()
);
create trigger accounting_settings_touch before update on public.accounting_settings for each row execute function private.touch_updated_at();
alter table public.accounting_settings enable row level security;
create policy acct_select on public.accounting_settings for select to authenticated using (private.has_perm(org_id, 'accounting', 'view'));
create policy acct_write on public.accounting_settings for all to authenticated
  using (private.has_action(org_id, 'settings.manage') or private.has_perm(org_id, 'accounting', 'edit'))
  with check (private.has_action(org_id, 'settings.manage') or private.has_perm(org_id, 'accounting', 'edit'));
revoke all on public.accounting_settings from anon;
