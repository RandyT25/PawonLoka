-- Server-side audit log for the Telegram + Claude agent layer (AGENT_LAYER_DESIGN.md).
-- Deliberately NOT following this repo's usual "anon can read/insert/update/delete" convention
-- (see fix_rls_security.sql, 20260712000000_fix_stock_opname_production_rls.sql, etc.) — this
-- table must stay unreachable from the anon key every existing app (POS/Backoffice/Owner/Staff/
-- Customer) already uses. Only the agent layer's own scoped Postgres role(s) get policies here,
-- scoped with an explicit `to` clause rather than `public`.
--
-- Phase 1A only needs agent_reader (created in 20260818000000_create_agent_roles.sql) to be able
-- to insert its own audit rows. agent_writer's policies on this table are added in the Phase 1B
-- migration, once that role exists — see AGENT_LAYER_DESIGN.md / the Phase 1A-1B implementation plan.

create table if not exists public.agent_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  telegram_user_id bigint not null,
  telegram_update_id bigint,
  mapped_identity text,
  capability text not null,
  stage text not null check (stage in ('read', 'propose', 'confirm', 'execute')),
  params jsonb,
  result_summary jsonb,
  error text,
  confirmation_id uuid
);

alter table public.agent_audit_log enable row level security;

grant insert on public.agent_audit_log to agent_reader;

drop policy if exists "agent_reader can insert agent_audit_log" on public.agent_audit_log;

create policy "agent_reader can insert agent_audit_log"
  on public.agent_audit_log for insert
  to agent_reader
  with check (true);
