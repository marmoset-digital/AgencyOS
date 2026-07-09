-- 0016_support_tickets_rls.sql
-- Support Tickets (minimal v1): guarantee any team member can manage tickets + replies.
-- The tables already exist (schema 001). This adds clean, idempotent team RLS on top of
-- whatever policies are already present (multiple permissive policies simply OR together).
-- Idempotent.

alter table public.support_tickets enable row level security;
alter table public.ticket_replies  enable row level security;

drop policy if exists "team_all_support_tickets" on public.support_tickets;
create policy "team_all_support_tickets" on public.support_tickets
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

drop policy if exists "team_all_ticket_replies" on public.ticket_replies;
create policy "team_all_ticket_replies" on public.ticket_replies
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

grant select, insert, update, delete on public.support_tickets to authenticated;
grant select, insert, update, delete on public.ticket_replies  to authenticated;
