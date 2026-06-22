--
-- PostgreSQL database dump
--

\restrict wELl6UwrYnYHDhAfYTyD0RIzuc656XKFwQwd6eXmoOSW1kbr6Xwde1bnzOBx6xb

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: get_my_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_role() RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result TEXT;
BEGIN
  SET LOCAL row_security = off;
  SELECT role INTO result FROM users WHERE id = auth.uid();
  RETURN result;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: is_team_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_team_member() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select exists (select 1 from public.users where id = auth.uid()) $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: client_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_packages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    package_id uuid,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date,
    monthly_value numeric(10,2),
    active_modules jsonb DEFAULT '{"ads_reporting": false, "seo_reporting": false, "social_posting": false, "email_marketing": false, "social_networks": []}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    author_id uuid,
    author_contact_id uuid,
    content text NOT NULL,
    mentions uuid[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comments_entity_type_check CHECK ((entity_type = ANY (ARRAY['task'::text, 'project'::text, 'ticket'::text])))
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    industry text,
    website text,
    abn_acn text,
    status text DEFAULT 'lead'::text NOT NULL,
    lead_source text,
    lead_stage text,
    estimated_value numeric(10,2),
    services_enquired text[],
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    address text,
    suburb text,
    state text,
    postcode text,
    CONSTRAINT companies_lead_source_check CHECK ((lead_source = ANY (ARRAY['website'::text, 'referral'::text, 'linkedin'::text, 'google_ads'::text, 'meta_ads'::text, 'cold_outreach'::text, 'other'::text]))),
    CONSTRAINT companies_lead_stage_check CHECK ((lead_stage = ANY (ARRAY['new_enquiry'::text, 'proposal_sent'::text, 'negotiation'::text, 'won'::text, 'lost'::text]))),
    CONSTRAINT companies_status_check CHECK ((status = ANY (ARRAY['lead'::text, 'active_client'::text, 'inactive'::text, 'churned'::text])))
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    job_title text,
    email text NOT NULL,
    phone text,
    is_primary boolean DEFAULT false NOT NULL,
    portal_access boolean DEFAULT false NOT NULL,
    portal_user_id uuid,
    notification_preferences jsonb DEFAULT '{"ticket_updates": true, "project_updates": true, "approval_requests": true, "invoice_notifications": true}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid,
    project_id uuid,
    task_id uuid,
    ticket_id uuid,
    name text NOT NULL,
    storage_path text,
    external_url text,
    file_type text,
    file_size bigint,
    is_google_drive boolean DEFAULT false NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    xero_invoice_id text,
    invoice_number text,
    status text DEFAULT 'draft'::text NOT NULL,
    amount numeric(10,2) NOT NULL,
    amount_paid numeric(10,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'AUD'::text NOT NULL,
    issue_date date,
    due_date date,
    paid_date date,
    line_items jsonb,
    xero_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'paid'::text, 'overdue'::text, 'voided'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text,
    entity_type text,
    entity_id uuid,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: package_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package_services (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    package_id uuid NOT NULL,
    service_id uuid NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    scope_description text,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.packages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    monthly_price numeric(10,2),
    is_active boolean DEFAULT true NOT NULL,
    is_embeddable boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    type text DEFAULT 'project'::text NOT NULL,
    stage text DEFAULT 'quote_sent'::text NOT NULL,
    start_date date,
    end_date date,
    monthly_hours_cap integer,
    monthly_tasks_cap integer,
    assigned_to uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT projects_stage_check CHECK ((stage = ANY (ARRAY['quote_sent'::text, 'proposal_accepted'::text, 'onboarding'::text, 'active'::text, 'awaiting_feedback'::text, 'paused'::text, 'complete'::text, 'invoiced_closed'::text]))),
    CONSTRAINT projects_type_check CHECK ((type = ANY (ARRAY['project'::text, 'retainer'::text])))
);


--
-- Name: proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    package_id uuid,
    title text NOT NULL,
    content jsonb,
    status text DEFAULT 'draft'::text NOT NULL,
    total_value numeric(10,2),
    expires_at timestamp with time zone,
    sent_at timestamp with time zone,
    responded_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT proposals_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'declined'::text, 'expired'::text])))
);


--
-- Name: recurring_task_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_task_templates (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid,
    company_id uuid,
    title text NOT NULL,
    description text,
    assignee_id uuid,
    frequency text NOT NULL,
    day_of_week integer,
    day_of_month integer,
    priority text DEFAULT 'medium'::text NOT NULL,
    time_estimate integer,
    active boolean DEFAULT true NOT NULL,
    last_generated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recurring_task_templates_day_of_month_check CHECK (((day_of_month >= 1) AND (day_of_month <= 31))),
    CONSTRAINT recurring_task_templates_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
    CONSTRAINT recurring_task_templates_frequency_check CHECK ((frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'fortnightly'::text, 'monthly'::text]))),
    CONSTRAINT recurring_task_templates_priority_check CHECK ((priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])))
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    pricing_type text NOT NULL,
    fixed_price numeric(10,2),
    hourly_rate numeric(10,2),
    monthly_fee numeric(10,2),
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT services_pricing_type_check CHECK ((pricing_type = ANY (ARRAY['fixed'::text, 'subscription'::text, 'hourly'::text])))
);


--
-- Name: social_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_approvals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    social_post_id uuid NOT NULL,
    contact_id uuid,
    token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    response_message text,
    responded_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT social_approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'changes_requested'::text])))
);


--
-- Name: social_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_posts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    project_id uuid,
    caption text,
    platform text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    media_urls text[],
    scheduled_at timestamp with time zone,
    published_at timestamp with time zone,
    platform_post_id text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT social_posts_platform_check CHECK ((platform = ANY (ARRAY['instagram'::text, 'facebook'::text, 'linkedin'::text, 'x'::text, 'google_business'::text]))),
    CONSTRAINT social_posts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_internal_review'::text, 'pending_client_approval'::text, 'approved'::text, 'scheduled'::text, 'published'::text, 'changes_requested'::text, 'rejected'::text])))
);


--
-- Name: subtasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subtasks (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    task_id uuid NOT NULL,
    title text NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    project_id uuid,
    contact_id uuid,
    subject text NOT NULL,
    description text,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    assignee_id uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT support_tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'awaiting_client'::text, 'resolved'::text, 'closed'::text])))
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid,
    company_id uuid,
    title text NOT NULL,
    description text,
    assignee_id uuid,
    due_date date,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'todo'::text NOT NULL,
    time_estimate integer,
    is_recurring boolean DEFAULT false NOT NULL,
    recurring_template_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'done'::text])))
);


--
-- Name: ticket_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_replies (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    ticket_id uuid NOT NULL,
    author_type text NOT NULL,
    author_user_id uuid,
    author_contact_id uuid,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ticket_replies_author_type_check CHECK ((author_type = ANY (ARRAY['team'::text, 'client'::text])))
);


--
-- Name: time_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_logs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    task_id uuid,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    duration_minutes integer NOT NULL,
    description text,
    is_billable boolean DEFAULT true NOT NULL,
    logged_at date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'team_member'::text NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))
);


--
-- Name: client_packages client_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_packages
    ADD CONSTRAINT client_packages_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_xero_invoice_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_xero_invoice_id_key UNIQUE (xero_invoice_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: package_services package_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_services
    ADD CONSTRAINT package_services_pkey PRIMARY KEY (id);


--
-- Name: packages packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: proposals proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_pkey PRIMARY KEY (id);


--
-- Name: recurring_task_templates recurring_task_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: social_approvals social_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_approvals
    ADD CONSTRAINT social_approvals_pkey PRIMARY KEY (id);


--
-- Name: social_approvals social_approvals_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_approvals
    ADD CONSTRAINT social_approvals_token_key UNIQUE (token);


--
-- Name: social_posts social_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_pkey PRIMARY KEY (id);


--
-- Name: subtasks subtasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT subtasks_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: ticket_replies ticket_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_replies
    ADD CONSTRAINT ticket_replies_pkey PRIMARY KEY (id);


--
-- Name: time_logs time_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_logs
    ADD CONSTRAINT time_logs_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_companies_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_status ON public.companies USING btree (status);


--
-- Name: idx_contacts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_company ON public.contacts USING btree (company_id);


--
-- Name: idx_notifications_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_read ON public.notifications USING btree (user_id, read);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: idx_projects_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_company ON public.projects USING btree (company_id);


--
-- Name: idx_projects_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_stage ON public.projects USING btree (stage);


--
-- Name: idx_social_posts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_company ON public.social_posts USING btree (company_id);


--
-- Name: idx_social_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_status ON public.social_posts USING btree (status);


--
-- Name: idx_support_tickets_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_company ON public.support_tickets USING btree (company_id);


--
-- Name: idx_support_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);


--
-- Name: idx_tasks_assignee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_assignee ON public.tasks USING btree (assignee_id);


--
-- Name: idx_tasks_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_due_date ON public.tasks USING btree (due_date);


--
-- Name: idx_tasks_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_project ON public.tasks USING btree (project_id);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_time_logs_logged_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_logs_logged_at ON public.time_logs USING btree (logged_at);


--
-- Name: idx_time_logs_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_logs_project ON public.time_logs USING btree (project_id);


--
-- Name: idx_time_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_logs_user ON public.time_logs USING btree (user_id);


--
-- Name: client_packages set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_packages FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: comments set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: companies set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: contacts set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: invoices set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: packages set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: projects set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: proposals set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: services set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: social_posts set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.social_posts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: support_tickets set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: tasks set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: time_logs set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.time_logs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: users set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: client_packages client_packages_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_packages
    ADD CONSTRAINT client_packages_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: client_packages client_packages_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_packages
    ADD CONSTRAINT client_packages_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE SET NULL;


--
-- Name: comments comments_author_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_contact_id_fkey FOREIGN KEY (author_contact_id) REFERENCES public.contacts(id);


--
-- Name: comments comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: companies companies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: contacts contacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_portal_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES auth.users(id);


--
-- Name: files files_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: files files_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: files files_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: files files_ticket_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_ticket_fk FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE SET NULL;


--
-- Name: files files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: invoices invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: package_services package_services_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_services
    ADD CONSTRAINT package_services_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE CASCADE;


--
-- Name: package_services package_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_services
    ADD CONSTRAINT package_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: projects projects_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: projects projects_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: proposals proposals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: proposals proposals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: proposals proposals_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE SET NULL;


--
-- Name: recurring_task_templates recurring_task_templates_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users(id);


--
-- Name: recurring_task_templates recurring_task_templates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: recurring_task_templates recurring_task_templates_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_task_templates
    ADD CONSTRAINT recurring_task_templates_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: social_approvals social_approvals_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_approvals
    ADD CONSTRAINT social_approvals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: social_approvals social_approvals_social_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_approvals
    ADD CONSTRAINT social_approvals_social_post_id_fkey FOREIGN KEY (social_post_id) REFERENCES public.social_posts(id) ON DELETE CASCADE;


--
-- Name: social_posts social_posts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: social_posts social_posts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: social_posts social_posts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: subtasks subtasks_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT subtasks_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users(id);


--
-- Name: support_tickets support_tickets_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users(id);


--
-- Name: tasks tasks_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: tasks tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_recurring_template_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_recurring_template_fk FOREIGN KEY (recurring_template_id) REFERENCES public.recurring_task_templates(id) ON DELETE SET NULL;


--
-- Name: ticket_replies ticket_replies_author_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_replies
    ADD CONSTRAINT ticket_replies_author_contact_id_fkey FOREIGN KEY (author_contact_id) REFERENCES public.contacts(id);


--
-- Name: ticket_replies ticket_replies_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_replies
    ADD CONSTRAINT ticket_replies_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id);


--
-- Name: ticket_replies ticket_replies_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_replies
    ADD CONSTRAINT ticket_replies_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: time_logs time_logs_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_logs
    ADD CONSTRAINT time_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: time_logs time_logs_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_logs
    ADD CONSTRAINT time_logs_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: time_logs time_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_logs
    ADD CONSTRAINT time_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: packages Packages are publicly readable for embed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Packages are publicly readable for embed" ON public.packages FOR SELECT USING ((is_embeddable = true));


--
-- Name: client_packages Team members can manage client packages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage client packages" ON public.client_packages USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: comments Team members can manage comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage comments" ON public.comments USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: companies Team members can manage companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage companies" ON public.companies USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: contacts Team members can manage contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage contacts" ON public.contacts USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: files Team members can manage files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage files" ON public.files USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: invoices Team members can manage invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage invoices" ON public.invoices USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: package_services Team members can manage package services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage package services" ON public.package_services USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: packages Team members can manage packages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage packages" ON public.packages USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: projects Team members can manage projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage projects" ON public.projects USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: proposals Team members can manage proposals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage proposals" ON public.proposals USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: recurring_task_templates Team members can manage recurring templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage recurring templates" ON public.recurring_task_templates USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: services Team members can manage services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage services" ON public.services USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: social_approvals Team members can manage social approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage social approvals" ON public.social_approvals USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: social_posts Team members can manage social posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage social posts" ON public.social_posts USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: subtasks Team members can manage subtasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage subtasks" ON public.subtasks USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: support_tickets Team members can manage support tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage support tickets" ON public.support_tickets USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: tasks Team members can manage tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage tasks" ON public.tasks USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: ticket_replies Team members can manage ticket replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage ticket replies" ON public.ticket_replies USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: time_logs Team members can manage time logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can manage time logs" ON public.time_logs USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = ANY (ARRAY['admin'::text, 'team_member'::text, 'intern'::text])))));


--
-- Name: users Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING ((auth.uid() = id));


--
-- Name: notifications Users see own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own notifications" ON public.notifications USING ((auth.uid() = user_id));


--
-- Name: client_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: package_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.package_services ENABLE ROW LEVEL SECURITY;

--
-- Name: packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: recurring_task_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recurring_task_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

--
-- Name: social_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: social_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: subtasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: users team_read_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_read_users ON public.users FOR SELECT TO authenticated USING (public.is_team_member());


--
-- Name: ticket_replies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_replies ENABLE ROW LEVEL SECURITY;

--
-- Name: time_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own ON public.users FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION get_my_role(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_role() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION handle_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_updated_at() TO anon;
GRANT ALL ON FUNCTION public.handle_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.handle_updated_at() TO service_role;


--
-- Name: FUNCTION is_team_member(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_team_member() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_team_member() TO authenticated;
GRANT ALL ON FUNCTION public.is_team_member() TO service_role;


--
-- Name: TABLE client_packages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.client_packages TO anon;
GRANT ALL ON TABLE public.client_packages TO authenticated;
GRANT ALL ON TABLE public.client_packages TO service_role;


--
-- Name: TABLE comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comments TO anon;
GRANT ALL ON TABLE public.comments TO authenticated;
GRANT ALL ON TABLE public.comments TO service_role;


--
-- Name: TABLE companies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.companies TO anon;
GRANT ALL ON TABLE public.companies TO authenticated;
GRANT ALL ON TABLE public.companies TO service_role;


--
-- Name: TABLE contacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contacts TO anon;
GRANT ALL ON TABLE public.contacts TO authenticated;
GRANT ALL ON TABLE public.contacts TO service_role;


--
-- Name: TABLE files; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.files TO anon;
GRANT ALL ON TABLE public.files TO authenticated;
GRANT ALL ON TABLE public.files TO service_role;


--
-- Name: TABLE invoices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invoices TO anon;
GRANT ALL ON TABLE public.invoices TO authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE package_services; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.package_services TO anon;
GRANT ALL ON TABLE public.package_services TO authenticated;
GRANT ALL ON TABLE public.package_services TO service_role;


--
-- Name: TABLE packages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.packages TO anon;
GRANT ALL ON TABLE public.packages TO authenticated;
GRANT ALL ON TABLE public.packages TO service_role;


--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.projects TO anon;
GRANT ALL ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;


--
-- Name: TABLE proposals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.proposals TO anon;
GRANT ALL ON TABLE public.proposals TO authenticated;
GRANT ALL ON TABLE public.proposals TO service_role;


--
-- Name: TABLE recurring_task_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recurring_task_templates TO anon;
GRANT ALL ON TABLE public.recurring_task_templates TO authenticated;
GRANT ALL ON TABLE public.recurring_task_templates TO service_role;


--
-- Name: TABLE services; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.services TO anon;
GRANT ALL ON TABLE public.services TO authenticated;
GRANT ALL ON TABLE public.services TO service_role;


--
-- Name: TABLE social_approvals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.social_approvals TO anon;
GRANT ALL ON TABLE public.social_approvals TO authenticated;
GRANT ALL ON TABLE public.social_approvals TO service_role;


--
-- Name: TABLE social_posts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.social_posts TO anon;
GRANT ALL ON TABLE public.social_posts TO authenticated;
GRANT ALL ON TABLE public.social_posts TO service_role;


--
-- Name: TABLE subtasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subtasks TO anon;
GRANT ALL ON TABLE public.subtasks TO authenticated;
GRANT ALL ON TABLE public.subtasks TO service_role;


--
-- Name: TABLE support_tickets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.support_tickets TO anon;
GRANT ALL ON TABLE public.support_tickets TO authenticated;
GRANT ALL ON TABLE public.support_tickets TO service_role;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;


--
-- Name: TABLE ticket_replies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ticket_replies TO anon;
GRANT ALL ON TABLE public.ticket_replies TO authenticated;
GRANT ALL ON TABLE public.ticket_replies TO service_role;


--
-- Name: TABLE time_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.time_logs TO anon;
GRANT ALL ON TABLE public.time_logs TO authenticated;
GRANT ALL ON TABLE public.time_logs TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict wELl6UwrYnYHDhAfYTyD0RIzuc656XKFwQwd6eXmoOSW1kbr6Xwde1bnzOBx6xb

