-- Backstop against orders where items/subtotal/tax/discount/total drift out of
-- sync (the root cause of the Sate Kambing incident and similar). This is the
-- one enforcement point every write to `orders` passes through no matter which
-- app or future code wrote it, since RLS here is fully permissive and several
-- call sites bypass any shared client-side helper.
create table if not exists public.order_anomalies (
  id              bigint generated always as identity primary key,
  order_id        text not null,
  expected_total  numeric not null,
  stored_total    numeric not null,
  diff            numeric not null,
  items_snapshot  jsonb,
  created_at      timestamptz not null default now()
);

alter table public.order_anomalies enable row level security;

create policy "anon can read order_anomalies"
  on public.order_anomalies for select
  using (true);

create policy "anon can insert order_anomalies"
  on public.order_anomalies for insert
  with check (true);

create index order_anomalies_order_id_idx  on public.order_anomalies (order_id);
create index order_anomalies_created_at_idx on public.order_anomalies (created_at desc);

create or replace function public.enforce_order_subtotal()
returns trigger as $$
declare
  computed_subtotal numeric;
  expected_total numeric;
  diff numeric;
begin
  select coalesce(sum(
           (coalesce((elem->>'price')::numeric, 0) - coalesce((elem->>'itemDisc')::numeric, 0))
           * coalesce((elem->>'qty')::numeric, 1)
         ), 0)
    into computed_subtotal
  from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) as elem;

  new.subtotal := computed_subtotal;

  expected_total := computed_subtotal - coalesce(new.discount, 0) + coalesce(new.tax, 0) - coalesce(new.refund_amount, 0);
  diff := coalesce(new.total, 0) - expected_total;

  if abs(diff) > 5 then
    insert into public.order_anomalies (order_id, expected_total, stored_total, diff, items_snapshot)
    values (new.id, expected_total, new.total, diff, new.items);
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_enforce_subtotal on public.orders;
create trigger orders_enforce_subtotal
  before insert or update on public.orders
  for each row execute function public.enforce_order_subtotal();
