-- Scoped Postgres role for the Telegram + Claude agent layer's read side (AGENT_LAYER_DESIGN.md
-- Section 11; confirmed viable via live pre-flight test against this project on 2026-08-18 —
-- a scratch role was created, authenticated through the Supavisor pooler in transaction mode,
-- and correctly denied access to any table it wasn't granted).
--
-- This is a PERMANENT role, never upgraded to hold write grants later — a separate agent_writer
-- role is created in the Phase 1B migration for that. agent_reader's only mandatory write is to
-- its own audit trail (agent_audit_log), never to any business table.
--
-- Deliberately no PASSWORD clause here: this file is committed to git, and a role's login
-- password must never be. Set it out-of-band after this migration runs:
--   alter role agent_reader password '<generated secret, never committed anywhere>';
-- then store that value only as a Cloudflare Worker/Hyperdrive secret, never in this repo.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'agent_reader') then
    create role agent_reader login;
  end if;
end
$$;

grant select on public.orders to agent_reader;
-- grant insert on agent_audit_log happens in the next migration, once that table exists
