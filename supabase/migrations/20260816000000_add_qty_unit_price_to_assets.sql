alter table public.assets add column if not exists qty numeric(14,2) not null default 1;
alter table public.assets add column if not exists unit_price numeric(14,2) not null default 0;
