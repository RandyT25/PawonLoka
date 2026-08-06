-- Staff consumption tracking: staff take food/ingredients for personal use
-- (e.g. eating an egg). Kept as its own table, separate from waste_records,
-- so real spoilage/waste numbers don't get mixed with staff meals.
-- Same anon-allow-all RLS convention as every other table here (no per-user auth) —
-- see 20260712000000_fix_stock_opname_production_rls.sql.

create table if not exists public.staff_consumption (
  id text primary key,
  date date not null,
  ingredient_id text,
  ingredient_name text,
  qty numeric not null,
  unit text,
  cost numeric default 0,
  consumed_by text,
  notes text,
  submission_id text,
  created_at timestamptz default now()
);

alter table public.staff_consumption enable row level security;
drop policy if exists "anon can read staff_consumption" on public.staff_consumption;
drop policy if exists "anon can insert staff_consumption" on public.staff_consumption;
drop policy if exists "anon can update staff_consumption" on public.staff_consumption;
drop policy if exists "anon can delete staff_consumption" on public.staff_consumption;
create policy "anon can read staff_consumption"   on public.staff_consumption for select using (true);
create policy "anon can insert staff_consumption" on public.staff_consumption for insert with check (true);
create policy "anon can update staff_consumption" on public.staff_consumption for update using (true);
create policy "anon can delete staff_consumption" on public.staff_consumption for delete using (true);
