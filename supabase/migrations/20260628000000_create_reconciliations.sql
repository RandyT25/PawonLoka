create table if not exists public.reconciliations (
  id              uuid primary key default gen_random_uuid(),
  recon_no        text not null,
  recon_date      date,
  payment_method  text,
  cashier_name    text,
  outlet          text,
  amount          numeric(14,2) not null default 0,
  status          text not null default 'unreconciled'
                    check (status in ('reconciled','unreconciled')),
  notes           text,
  bank_ref        text,
  reconciled_by   text,
  reconciled_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Table may already exist from an earlier ad hoc creation with a slightly
-- different column set — bring it in line with the schema this file intends.
alter table public.reconciliations add column if not exists recon_date date;
alter table public.reconciliations add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reconciliations_recon_no_key') then
    alter table public.reconciliations
      add constraint reconciliations_recon_no_key unique (recon_no);
  end if;
end $$;

alter table public.reconciliations enable row level security;

drop policy if exists "anon can read reconciliations" on public.reconciliations;
drop policy if exists "anon can insert reconciliations" on public.reconciliations;
drop policy if exists "anon can update reconciliations" on public.reconciliations;
drop policy if exists "anon can delete reconciliations" on public.reconciliations;

create policy "anon can read reconciliations"
  on public.reconciliations for select
  using (true);

create policy "anon can insert reconciliations"
  on public.reconciliations for insert
  with check (true);

create policy "anon can update reconciliations"
  on public.reconciliations for update
  using (true);

create policy "anon can delete reconciliations"
  on public.reconciliations for delete
  using (true);

create index if not exists reconciliations_recon_date_idx on public.reconciliations (recon_date desc);
create index if not exists reconciliations_status_idx     on public.reconciliations (status);
