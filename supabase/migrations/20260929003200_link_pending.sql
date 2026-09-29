-- A builder that adds an existing sub company gets a pending link until that company accepts.
-- (Own migration: a new enum value must be committed before SQL functions can reference it.)
alter type public.link_status add value if not exists 'pending' before 'active';
