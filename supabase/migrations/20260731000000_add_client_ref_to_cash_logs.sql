-- Prevents duplicate cash_logs rows (e.g. a double-tap on "Simpan" in Kas
-- Operasional, or dbWrite's offline-queue replaying an insert that actually
-- already succeeded server-side after a false timeout).

-- Client-generated idempotency key. Partial unique index so historical rows
-- (which have no client_ref) aren't affected.
alter table public.cash_logs add column if not exists client_ref text;

create unique index if not exists cash_logs_client_ref_idx
  on public.cash_logs (client_ref)
  where client_ref is not null;

-- Belt-and-suspenders server-side guard, independent of client code: refuse
-- to insert a row that looks identical to one inserted moments ago. This
-- protects against any future insert path into cash_logs that doesn't set
-- client_ref, not just the two screens fixed alongside this migration.
create or replace function public.reject_duplicate_cash_log()
returns trigger as $$
begin
  if exists (
    select 1 from public.cash_logs
    where type = new.type
      and amount = new.amount
      and reason = new.reason
      and staff = new.staff
      and date = new.date
      and created_at > now() - interval '5 seconds'
  ) then
    return null; -- silently drop the duplicate insert
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists cash_logs_reject_duplicate on public.cash_logs;

create trigger cash_logs_reject_duplicate
  before insert on public.cash_logs
  for each row execute function public.reject_duplicate_cash_log();
