-- Inventory integrity foundation.  This migration is intentionally additive: old clients can
-- continue writing stock_movements while updated clients write the richer audit fields below.
alter table public.stock_movements
  add column if not exists order_id text,
  add column if not exists order_item_key text,
  add column if not exists recipe_line_key text,
  add column if not exists source_event text,
  add column if not exists reversal_of text references public.stock_movements(id),
  add column if not exists actor text,
  add column if not exists stock_before numeric,
  add column if not exists stock_after numeric,
  add column if not exists rebuild_session_id text;

create index if not exists stock_movements_order_id_idx on public.stock_movements(order_id);
create index if not exists stock_movements_reversal_of_idx on public.stock_movements(reversal_of);

create table if not exists public.modifier_option_ingredients (
  id text primary key,
  modifier_group_id text not null references public.modifier_groups(id) on delete cascade,
  option_name text not null,
  ingredient_id text not null references public.ingredients(id),
  qty numeric not null check (qty > 0),
  unit text not null,
  unique (modifier_group_id, option_name, ingredient_id)
);

alter table public.products
  add column if not exists inventory_policy text not null default 'tracked'
    check (inventory_policy in ('tracked', 'exempt')),
  add column if not exists inventory_exempt_reason text;

create table if not exists public.inventory_rebuild_sessions (
  id text primary key,
  baseline_opname_id text references public.stock_opname(id),
  baseline_date date not null,
  status text not null default 'preview' check (status in ('preview', 'approved', 'cancelled')),
  preview jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by text,
  approved_at timestamptz,
  approved_by text
);
