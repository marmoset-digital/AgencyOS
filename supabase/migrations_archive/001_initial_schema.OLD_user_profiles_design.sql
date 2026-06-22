-- ============================================================
-- AGENCY OS — Initial Database Schema
-- Marmoset Digital Media
-- Version: 1.0
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS (extends Supabase auth.users)
-- ============================================================
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null,
  email text not null unique,
  role text not null default 'team_member' check (role in ('admin', 'team_member', 'intern')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- COMPANIES (primary CRM entity)
-- ============================================================
create table public.companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  industry text,
  website text,
  billing_address text,
  abn_acn text,
  status text not null default 'lead' check (status in ('lead', 'active', 'inactive', 'churned')),
  lead_source text check (lead_source in ('website', 'referral', 'linkedin', 'google_ads', 'meta_ads', 'cold_outreach', 'other')),
  lead_stage text check (lead_stage in ('new_enquiry', 'proposal_sent', 'negotiation', 'won', 'lost')),
  estimated_value numeric(10,2),
  services_enquired text[],
  notes text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CONTACTS (linked to companies)
-- ============================================================
create table public.contacts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  job_title text,
  email text not null,
  phone text,
  is_primary boolean not null default false,
  portal_access boolean not null default false,
  portal_user_id uuid references auth.users(id),
  notification_preferences jsonb not null default '{"project_updates": true, "invoice_notifications": true, "approval_requests": true, "ticket_updates": true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PROJECTS
-- ============================================================
create table public.projects (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  type text not null default 'project' check (type in ('project', 'retainer')),
  stage text not null default 'quote_sent' check (stage in (
    'quote_sent',
    'proposal_accepted',
    'onboarding',
    'active',
    'awaiting_feedback',
    'paused',
    'complete',
    'invoiced_closed'
  )),
  start_date date,
  end_date date,
  monthly_hours_cap integer,
  monthly_tasks_cap integer,
  assigned_to uuid references public.users(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TASKS
-- ============================================================
create table public.tasks (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references public.projects(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  title text not null,
  description text,
  assignee_id uuid references public.users(id),
  due_date date,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  time_estimate integer, -- minutes
  is_recurring boolean not null default false,
  recurring_template_id uuid,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- SUBTASKS
-- ============================================================
create table public.subtasks (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TIME LOGS
-- ============================================================
create table public.time_logs (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid references public.tasks(id) on delete set null,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id),
  duration_minutes integer not null,
  description text,
  is_billable boolean not null default true,
  logged_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- RECURRING TASK TEMPLATES
-- ============================================================
create table public.recurring_task_templates (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references public.projects(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  title text not null,
  description text,
  assignee_id uuid references public.users(id),
  frequency text not null check (frequency in ('daily', 'weekly', 'fortnightly', 'monthly')),
  day_of_week integer check (day_of_week between 0 and 6),
  day_of_month integer check (day_of_month between 1 and 31),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  time_estimate integer,
  active boolean not null default true,
  last_generated_at timestamptz,
  created_at timestamptz not null default now()
);

-- Add FK from tasks to recurring templates
alter table public.tasks
  add constraint tasks_recurring_template_fk
  foreign key (recurring_template_id)
  references public.recurring_task_templates(id) on delete set null;

-- ============================================================
-- COMMENTS (on tasks, projects, tickets)
-- ============================================================
create table public.comments (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null check (entity_type in ('task', 'project', 'ticket')),
  entity_id uuid not null,
  author_id uuid references public.users(id),
  author_contact_id uuid references public.contacts(id),
  content text not null,
  mentions uuid[], -- array of user IDs mentioned
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- FILES
-- ============================================================
create table public.files (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  ticket_id uuid, -- FK added after tickets table
  name text not null,
  storage_path text, -- Supabase storage path
  external_url text, -- for Google Drive links
  file_type text,
  file_size bigint,
  is_google_drive boolean not null default false,
  uploaded_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- SERVICES (service catalogue)
-- ============================================================
create table public.services (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  pricing_type text not null check (pricing_type in ('fixed', 'subscription', 'hourly')),
  fixed_price numeric(10,2),
  hourly_rate numeric(10,2),
  monthly_fee numeric(10,2),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PACKAGES (mix-and-match service bundles)
-- ============================================================
create table public.packages (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  monthly_price numeric(10,2),
  is_active boolean not null default true,
  is_embeddable boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PACKAGE SERVICES (items included in a package)
-- ============================================================
create table public.package_services (
  id uuid primary key default uuid_generate_v4(),
  package_id uuid not null references public.packages(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  quantity integer not null default 1,
  scope_description text,
  sort_order integer not null default 0
);

-- ============================================================
-- CLIENT PACKAGES (which package a client is on)
-- ============================================================
create table public.client_packages (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  package_id uuid references public.packages(id) on delete set null,
  start_date date not null default current_date,
  end_date date,
  monthly_value numeric(10,2),
  active_modules jsonb not null default '{
    "social_posting": false,
    "social_networks": [],
    "seo_reporting": false,
    "ads_reporting": false,
    "email_marketing": false
  }'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PROPOSALS
-- ============================================================
create table public.proposals (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  package_id uuid references public.packages(id) on delete set null,
  title text not null,
  content jsonb, -- rich content blocks
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  total_value numeric(10,2),
  expires_at timestamptz,
  sent_at timestamptz,
  responded_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- INVOICES (synced from Xero)
-- ============================================================
create table public.invoices (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  xero_invoice_id text unique,
  invoice_number text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'voided')),
  amount numeric(10,2) not null,
  amount_paid numeric(10,2) not null default 0,
  currency text not null default 'AUD',
  issue_date date,
  due_date date,
  paid_date date,
  line_items jsonb,
  xero_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- SUPPORT TICKETS
-- ============================================================
create table public.support_tickets (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  subject text not null,
  description text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'awaiting_client', 'resolved', 'closed')),
  assignee_id uuid references public.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add FK from files to tickets
alter table public.files
  add constraint files_ticket_fk
  foreign key (ticket_id)
  references public.support_tickets(id) on delete set null;

-- ============================================================
-- TICKET REPLIES
-- ============================================================
create table public.ticket_replies (
  id uuid primary key default uuid_generate_v4(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_type text not null check (author_type in ('team', 'client')),
  author_user_id uuid references public.users(id),
  author_contact_id uuid references public.contacts(id),
  content text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- SOCIAL POSTS
-- ============================================================
create table public.social_posts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  caption text,
  platform text not null check (platform in ('instagram', 'facebook', 'linkedin', 'x', 'google_business')),
  status text not null default 'draft' check (status in (
    'draft',
    'pending_internal_review',
    'pending_client_approval',
    'approved',
    'scheduled',
    'published',
    'changes_requested',
    'rejected'
  )),
  media_urls text[],
  scheduled_at timestamptz,
  published_at timestamptz,
  platform_post_id text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- SOCIAL APPROVALS (email-based client approval tokens)
-- ============================================================
create table public.social_approvals (
  id uuid primary key default uuid_generate_v4(),
  social_post_id uuid not null references public.social_posts(id) on delete cascade,
  contact_id uuid references public.contacts(id),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested')),
  response_message text,
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  entity_type text,
  entity_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_companies_status on public.companies(status);
create index idx_contacts_company on public.contacts(company_id);
create index idx_projects_company on public.projects(company_id);
create index idx_projects_stage on public.projects(stage);
create index idx_tasks_project on public.tasks(project_id);
create index idx_tasks_assignee on public.tasks(assignee_id);
create index idx_tasks_status on public.tasks(status);
create index idx_tasks_due_date on public.tasks(due_date);
create index idx_time_logs_project on public.time_logs(project_id);
create index idx_time_logs_user on public.time_logs(user_id);
create index idx_time_logs_logged_at on public.time_logs(logged_at);
create index idx_social_posts_company on public.social_posts(company_id);
create index idx_social_posts_status on public.social_posts(status);
create index idx_support_tickets_company on public.support_tickets(company_id);
create index idx_support_tickets_status on public.support_tickets(status);
create index idx_notifications_user on public.notifications(user_id);
create index idx_notifications_read on public.notifications(user_id, read);

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply updated_at triggers
create trigger set_updated_at before update on public.users for each row execute function handle_updated_at();
create trigger set_updated_at before update on public.companies for each row execute function handle_updated_at();
create trigger set_updated_at before update on public.contacts for each row execute function handle_updated_at();
create trigger set_updated_at before update on public.projects for each row execute function handle_updated_at();
create trigger set_updated_at before update on public.tasks for each row execute function handle_updated_at();
create trigger set_updated_at before update on public.time_logs for each row execute function handle_updated_at();
create trigger set_updated_at before update on public.comments for each row execute function handle_updated_at();
create trigger set_updated_at before update on public.services for each row execute function handle_updated_at();
create trigger set_updated_at before update on public.packages for each row execute function handle_updated_at();
create trigger set_updated_at before update on public.client_packages for each row execute function handle_updated_at();
create trigger set_updated_at before update on public.proposals for each row execute function handle_updated_at();
create trigger set_updated_at before update on public.invoices for each row execute function handle_updated_at();
create trigger set_updated_at before update on public.support_tickets for each row execute function handle_updated_at();
create trigger set_updated_at before update on public.social_posts for each row execute function handle_updated_at();

-- ============================================================
-- NEW USER TRIGGER (auto-creates user profile on signup)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'team_member')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.users enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.time_logs enable row level security;
alter table public.recurring_task_templates enable row level security;
alter table public.comments enable row level security;
alter table public.files enable row level security;
alter table public.services enable row level security;
alter table public.packages enable row level security;
alter table public.package_services enable row level security;
alter table public.client_packages enable row level security;
alter table public.proposals enable row level security;
alter table public.invoices enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ticket_replies enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_approvals enable row level security;
alter table public.notifications enable row level security;

-- Team members can read/write everything (RLS for internal team)
-- Clients (portal users) are handled via separate policies

-- Users table policies
create policy "Team members can view all users"
  on public.users for select
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id);

-- Companies — team members full access
create policy "Team members can manage companies"
  on public.companies for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Contacts — team members full access
create policy "Team members can manage contacts"
  on public.contacts for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Projects — team members full access
create policy "Team members can manage projects"
  on public.projects for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Tasks — team members full access
create policy "Team members can manage tasks"
  on public.tasks for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Subtasks
create policy "Team members can manage subtasks"
  on public.subtasks for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Time logs
create policy "Team members can manage time logs"
  on public.time_logs for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Recurring templates
create policy "Team members can manage recurring templates"
  on public.recurring_task_templates for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Comments
create policy "Team members can manage comments"
  on public.comments for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Files
create policy "Team members can manage files"
  on public.files for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Services
create policy "Team members can manage services"
  on public.services for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Packages
create policy "Team members can manage packages"
  on public.packages for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

create policy "Packages are publicly readable for embed"
  on public.packages for select
  using (is_embeddable = true);

-- Package services
create policy "Team members can manage package services"
  on public.package_services for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Client packages
create policy "Team members can manage client packages"
  on public.client_packages for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Proposals
create policy "Team members can manage proposals"
  on public.proposals for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Invoices
create policy "Team members can manage invoices"
  on public.invoices for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Support tickets
create policy "Team members can manage support tickets"
  on public.support_tickets for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Ticket replies
create policy "Team members can manage ticket replies"
  on public.ticket_replies for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Social posts
create policy "Team members can manage social posts"
  on public.social_posts for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

-- Social approvals — publicly accessible via token (for client approval links)
create policy "Team members can manage social approvals"
  on public.social_approvals for all
  using (auth.uid() in (select id from public.users where role in ('admin', 'team_member', 'intern')));

create policy "Social approvals readable by token"
  on public.social_approvals for select
  using (true); -- token validation handled in API route

-- Notifications — users see only their own
create policy "Users see own notifications"
  on public.notifications for all
  using (auth.uid() = user_id);
