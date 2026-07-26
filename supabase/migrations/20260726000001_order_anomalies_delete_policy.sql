-- The order_anomalies table only allowed anon insert/select (see
-- 20260723000000_order_consistency_trigger.sql), so reviewed/test entries
-- (e.g. TEST-TRIGGER-* rows) could never be cleared from the Order Anomalies
-- page — there was no delete policy for RLS to allow.
create policy "anon can delete order_anomalies"
  on public.order_anomalies for delete
  using (true);
