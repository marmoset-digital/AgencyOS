-- 0014_proposal_cover.sql
-- Proposals v2 (cover): auto proposal number (PRO-####) + recipient contact. Idempotent.

create sequence if not exists public.proposals_number_seq;

alter table public.proposals
  add column if not exists proposal_number text,
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

-- Back-fill numbers for existing proposals.
update public.proposals
  set proposal_number = 'PRO-' || lpad(nextval('public.proposals_number_seq')::text, 4, '0')
  where proposal_number is null;

-- New proposals get the next number automatically.
alter table public.proposals
  alter column proposal_number set default 'PRO-' || lpad(nextval('public.proposals_number_seq')::text, 4, '0');
