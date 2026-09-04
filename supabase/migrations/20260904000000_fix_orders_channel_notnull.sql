-- `orders.channel` was added directly in the Supabase dashboard as NOT NULL, with a check
-- constraint restricting it to ('dine_in','takeaway','delivery_other','gofood','grabfood',
-- 'shopeefood') and no default — and no matching app code (untracked by any prior migration
-- in this repo). Every order insert from POS and the customer self-order app has been failing
-- ("Gagal simpan order") since. App code now sends an explicit, valid channel value on every
-- insert; this default is a safety net for any insert path that omits it.
alter table public.orders
  alter column channel set default 'dine_in';
