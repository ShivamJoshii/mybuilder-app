-- Company branding and tax registration shown on documents.
-- GST/HST registration (Business Number + RT program account) is required on invoices over $30 (CRA).
alter table public.organizations
  add column gst_number text check (gst_number is null or gst_number ~* '^[0-9]{9} ?RT ?[0-9]{4}$'),
  add column qst_number text check (qst_number is null or length(qst_number) <= 20);
comment on column public.organizations.logo_url is 'storage:<key> for an uploaded logo';
