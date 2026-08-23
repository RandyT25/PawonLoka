-- agent_writer: narrowly-scoped write role for the operational Telegram bot (Waste, Production,
-- Receiving — AGENT_LAYER_DESIGN.md Part II / the Phase-1B-successor implementation plan).
-- PERMANENTLY separate from agent_reader (created in 20260818000000_create_agent_roles.sql) —
-- agent_reader is never upgraded to hold write grants; agent_writer is the only role that ever
-- gets INSERT anywhere, and only on staff_submissions.
--
-- No PASSWORD clause here — this file is committed to git, and a role's login password must
-- never be. Set it out-of-band after this migration runs:
--   alter role agent_writer password '<generated secret, never committed anywhere>';

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'agent_writer') then
    create role agent_writer login;
  end if;
end
$$;

-- Reads needed to resolve/cost a submission before proposing it (ingredient/recipe/supplier
-- name matching, cost calc) — same orders/ingredients read surface as agent_reader, extended
-- with the tables Production and Receiving specifically need.
grant select on public.orders to agent_writer;
grant select on public.ingredients to agent_writer;
grant select on public.sub_recipes to agent_writer;
grant select on public.sub_recipe_ingredients to agent_writer;
grant select on public.suppliers to agent_writer;
grant select (id, name, active, role) on public.staff to agent_writer;

-- The one write grant that matters: INSERT only, and RLS's WITH CHECK below additionally pins
-- it to a pending row of one of the three agent-originated types — agent_writer cannot insert
-- any other submission type (opname/consumption/requisition stay web-only for now) and cannot
-- insert a pre-approved row, structurally, not just by convention.
--
-- MUST be RESTRICTIVE, not the default PERMISSIVE — staff_submissions already has a pre-existing
-- blanket policy (`allow_all_staff_submissions`, `with check (true)`, `to public`, which includes
-- agent_writer). Permissive policies are OR'd together in Postgres, so a plain permissive policy
-- here would be silently bypassed by that always-true blanket one (confirmed live: an initial
-- version of this migration without AS RESTRICTIVE let a type='opname' and a status='approved'
-- row both insert successfully, exactly what this policy exists to prevent). RESTRICTIVE policies
-- are AND'd with permissive ones instead, so this one actually narrows access as intended without
-- touching the pre-existing policy anon/authenticated rely on.
grant insert on public.staff_submissions to agent_writer;

-- Also SELECT — required for the claim-and-insert to use `INSERT ... RETURNING` inside a single
-- atomic statement (see claimAndInsertSubmission in worker/src/confirmations.ts and its comment
-- for why a single statement, not a multi-statement transaction, is used). Postgres requires
-- SELECT privilege to use RETURNING at all (confirmed live — the exact same gotcha already found
-- with agent_reader/agent_audit_log during Phase 1A). This is not a meaningful widening of
-- agent_writer's boundary: the sensitive properties this role must never have were always
-- UPDATE/DELETE on staff_submissions and any grant on ingredients/waste_records/
-- production_batches/stock_movements, not read access to submission rows it helped create.
grant select on public.staff_submissions to agent_writer;

drop policy if exists "agent_writer can insert pending agent submissions" on public.staff_submissions;
create policy "agent_writer can insert pending agent submissions"
  on public.staff_submissions as restrictive for insert
  to agent_writer
  with check (type in ('waste', 'production', 'receiving') and status = 'pending');

-- Deliberately ABSENT, and the absence is the point: no grant of any kind to agent_writer on
-- ingredients (UPDATE), waste_records (INSERT), production_batches (INSERT), or stock_movements
-- (INSERT) — those writes happen only inside StaffSubmissions.jsx's approveOne(), after a human
-- approves in Backoffice. agent_writer structurally cannot perform them, regardless of what
-- Claude or a client sends. Verify this negative case live (see the pre-flight test in the plan)
-- before trusting it, exactly as agent_reader's boundary was verified in the prior migration.

grant insert on public.agent_audit_log to agent_writer;
drop policy if exists "agent_writer can insert agent_audit_log" on public.agent_audit_log;
create policy "agent_writer can insert agent_audit_log"
  on public.agent_audit_log for insert to agent_writer with check (true);
