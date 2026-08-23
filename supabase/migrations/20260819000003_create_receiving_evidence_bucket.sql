-- Storage bucket for Receiving invoice/nota photos (AGENT_LAYER_DESIGN.md P2.2/P2.4 photo-upload
-- pattern, same compress -> upload -> public URL contract as ClockInOutModal.jsx's
-- attendance-photos bucket). Public, matching every existing bucket in this project (no
-- signed-URL scheme is used anywhere in this codebase).
--
-- CORRECTED (2026-08-19, during Receiving workflow build-out): originally scoped upload access
-- `to agent_writer`, on the assumption the same Postgres-role credential model used for
-- Hyperdrive/Postgres access would carry over to Storage. It doesn't — confirmed live: Supabase
-- Storage's REST API authenticates only as `anon`/`service_role`/an Auth user JWT, never as an
-- arbitrary custom Postgres role, so a policy scoped `to agent_writer` is unreachable through
-- Storage's actual upload path (a real anon-key upload attempt returned 403 "row violates RLS
-- policy" against the old policy). Scoping to `anon` instead — bucket-specific, not a blanket
-- grant — matches exactly how every other public bucket in this project already works
-- (attendance-photos, logos, product-images all already allow anon uploads); this isn't a new
-- risk, just consistency with existing precedent. A service-role key remains explicitly excluded
-- (AGENT_LAYER_DESIGN.md Section 11: never touches Claude/Telegram/client-facing code).

insert into storage.buckets (id, name, public)
values ('receiving-evidence', 'receiving-evidence', true)
on conflict (id) do nothing;

drop policy if exists "agent_writer can upload receiving evidence" on storage.objects;
drop policy if exists "anon can upload receiving evidence" on storage.objects;
create policy "anon can upload receiving evidence"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'receiving-evidence');

-- Public read (via the bucket's public:true flag + Storage's own public-bucket serving) needs no
-- explicit SELECT policy here — same as every other public bucket in this project.
