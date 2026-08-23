-- Telegram identity -> staff mapping (AGENT_LAYER_DESIGN.md Section 11 / P2.7). Populated
-- manually out-of-band (Supabase Studio), never by the bot or Claude — no INSERT/UPDATE/DELETE
-- policy is granted to either agent role, deliberately.
--
-- staff_id is stored as plain text (not a hard FK) because staff.id's exact column type wasn't
-- re-verified live when this migration was written (inferred as text from "STAFF-"+Date.now()
-- style IDs used elsewhere in the app) — add a `references public.staff(id)` constraint later
-- once confirmed, if desired. staff_name is denormalized on purpose: staff_submissions.
-- submitted_by is a plain name string, never an FK, confirmed live in this codebase.

create table if not exists public.telegram_users (
  telegram_id bigint primary key,
  staff_id text,
  staff_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.telegram_users enable row level security;

grant select on public.telegram_users to agent_reader, agent_writer;

drop policy if exists "agent roles can read telegram_users" on public.telegram_users;
create policy "agent roles can read telegram_users"
  on public.telegram_users for select
  to agent_reader, agent_writer
  using (true);
