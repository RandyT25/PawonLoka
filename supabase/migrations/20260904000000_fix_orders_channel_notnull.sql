-- `orders.channel` was added directly in the Supabase dashboard as NOT NULL with no default
-- and no matching app code (untracked by any prior migration in this repo). Every order insert
-- from POS and the customer self-order app has been failing ("Gagal simpan order") since.
-- Give it a safe default so any insert that doesn't set it explicitly still succeeds.
alter table public.orders
  alter column channel set default 'pos';
