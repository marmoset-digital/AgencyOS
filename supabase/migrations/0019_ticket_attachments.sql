-- 0019_ticket_attachments.sql — File attachments on support tickets.
--
-- Clients attach files from the public /support/{token} portal, on new tickets and
-- on replies. Uploads go straight from the browser to Supabase Storage using a
-- short-lived signed upload URL that the server issues ONLY after validating the
-- support token. Two benefits: no storage credentials are ever exposed on a public
-- page, and the ~4.5MB serverless request-body ceiling doesn't apply, so 25MB phone
-- photos work fine.
--
-- The `files` table already exists (schema 0001) with a ticket_id FK to
-- support_tickets, so no new table is needed.
--
-- Additive and idempotent: safe to run on a live database.

-- Private bucket. 25MB per file. Downloads are served via short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-attachments',
  'ticket-attachments',
  false,
  26214400,  -- 25 MB
  array[
    'image/png','image/jpeg','image/jpg','image/gif','image/webp','image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv',
    'application/zip','application/x-zip-compressed'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Attachments are looked up per ticket on every ticket view.
create index if not exists files_ticket_id_idx
  on public.files (ticket_id) where ticket_id is not null;

-- Team members can already manage files (policy from schema 0001). Restated
-- idempotently so team-side reads are guaranteed regardless of policy drift.
alter table public.files enable row level security;

drop policy if exists "team_all_files" on public.files;
create policy "team_all_files" on public.files
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

grant select, insert, update, delete on public.files to authenticated;

-- NOTE: no storage RLS policies are needed for the public portal. Signed upload
-- URLs are minted server-side with the service-role key and authorise exactly one
-- object each; downloads use server-generated signed URLs. Anonymous users never
-- get direct bucket access.
