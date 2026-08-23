-- Propose -> confirm -> execute token model (AGENT_LAYER_DESIGN.md Section 9), shared by every
-- write capability (submit_waste_report, submit_production_report, submit_receiving_report).
-- callback_data on every inline-keyboard button carries only this row's opaque `id` — never
-- resolved data — matching this project's stated security posture. The single-use guarantee is
-- one atomic UPDATE claim in application code (status='pending' -> 'confirmed', WHERE status=
-- 'pending' AND expires_at > now() AND telegram_user_id = $requester), not this schema alone.
--
-- message_thread_id is populated for messages originating inside a Telegram Forum-mode Topic
-- (the operational Supergroup), so a confirmation reply can be posted back into the correct
-- Topic rather than the group's General channel.

create table if not exists public.agent_confirmations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  telegram_user_id bigint not null,
  chat_id bigint not null,
  message_thread_id bigint,
  message_id bigint,
  capability text not null,
  status text not null default 'resolving'
    check (status in ('resolving', 'pending', 'confirmed', 'cancelled', 'expired')),
  params jsonb not null default '{}'::jsonb,
  consumed_at timestamptz
);

alter table public.agent_confirmations enable row level security;

-- agent_writer only — agent_reader never touches this table, it stays permanently read-only
-- and has no business needing a confirmation flow of its own.
grant select, insert, update on public.agent_confirmations to agent_writer;

drop policy if exists "agent_writer full access to its own confirmations" on public.agent_confirmations;
create policy "agent_writer full access to its own confirmations"
  on public.agent_confirmations for all
  to agent_writer
  using (true) with check (true);
