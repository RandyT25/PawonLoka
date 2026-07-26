create table if not exists public.assets (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null default 'Other',
  amount        numeric(14,2) not null default 0,
  acquired_date date not null default current_date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.assets enable row level security;
drop policy if exists "anon can read assets" on public.assets;
drop policy if exists "anon can insert assets" on public.assets;
drop policy if exists "anon can update assets" on public.assets;
drop policy if exists "anon can delete assets" on public.assets;
create policy "anon can read assets"   on public.assets for select using (true);
create policy "anon can insert assets" on public.assets for insert with check (true);
create policy "anon can update assets" on public.assets for update using (true);
create policy "anon can delete assets" on public.assets for delete using (true);
create index if not exists assets_acquired_date_idx on public.assets (acquired_date desc);
