// ============================================================
// AGENCY OS — Core TypeScript Types
// ============================================================

export type UserRole = 'admin' | 'team_member' | 'intern'

export interface User {
  id: string
  full_name: string
  email: string
  role: UserRole
  avatar_url?: string
  created_at: string
  updated_at: string
}

export type CompanyStatus = 'lead' | 'active' | 'inactive' | 'churned'
export type LeadStage = 'new_enquiry' | 'proposal_sent' | 'negotiation' | 'won' | 'lost'
export type LeadSource = 'website' | 'referral' | 'linkedin' | 'google_ads' | 'meta_ads' | 'cold_outreach' | 'other'

export interface Company {
  id: string
  name: string
  industry?: string
  website?: string
  billing_address?: string
  abn_acn?: string
  status: CompanyStatus
  lead_source?: LeadSource
  lead_stage?: LeadStage
  estimated_value?: number
  services_enquired?: string[]
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
  contacts?: Contact[]
}

export interface Contact {
  id: string
  company_id: string
  first_name: string
  last_name: string
  job_title?: string
  email: string
  phone?: string
  is_primary: boolean
  portal_access: boolean
  portal_user_id?: string
  notification_preferences: {
    project_updates: boolean
    invoice_notifications: boolean
    approval_requests: boolean
    ticket_updates: boolean
  }
  created_at: string
  updated_at: string
  company?: Company
}

export type ProjectType = 'project' | 'retainer'
export type ProjectStage =
  | 'quote_sent'
  | 'proposal_accepted'
  | 'onboarding'
  | 'active'
  | 'awaiting_feedback'
  | 'paused'
  | 'complete'
  | 'invoiced_closed'

export const PROJECT_STAGES: { value: ProjectStage; label: string }[] = [
  { value: 'quote_sent', label: 'Quote / Proposal Sent' },
  { value: 'proposal_accepted', label: 'Proposal Accepted' },
  { value: 'onboarding', label: 'Onboarding in Progress' },
  { value: 'active', label: 'Active & In-Flight' },
  { value: 'awaiting_feedback', label: 'Awaiting Client Feedback' },
  { value: 'paused', label: 'Paused' },
  { value: 'complete', label: 'Complete' },
  { value: 'invoiced_closed', label: 'Invoiced & Closed' },
]

export interface Project {
  id: string
  company_id: string
  name: string
  description?: string
  type: ProjectType
  stage: ProjectStage
  start_date?: string
  end_date?: string
  monthly_hours_cap?: number
  monthly_tasks_cap?: number
  assigned_to?: string
  created_by?: string
  created_at: string
  updated_at: string
  company?: Company
  assigned_user?: User
}

export type TaskPriority = 'high' | 'medium' | 'low'
export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface Task {
  id: string
  project_id?: string
  company_id?: string
  title: string
  description?: string
  assignee_id?: string
  due_date?: string
  priority: TaskPriority
  status: TaskStatus
  time_estimate?: number // minutes
  is_recurring: boolean
  recurring_template_id?: string
  created_by?: string
  created_at: string
  updated_at: string
  assignee?: User
  project?: Project
  company?: Company
  subtasks?: Subtask[]
  time_logs?: TimeLog[]
}

export interface Subtask {
  id: string
  task_id: string
  title: string
  completed: boolean
  sort_order: number
  created_at: string
}

export interface TimeLog {
  id: string
  task_id?: string
  project_id: string
  user_id: string
  duration_minutes: number
  description?: string
  is_billable: boolean
  logged_at: string
  created_at: string
  updated_at: string
  user?: User
  project?: Project
}

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type TicketStatus = 'open' | 'in_progress' | 'awaiting_client' | 'resolved' | 'closed'

export interface SupportTicket {
  id: string
  company_id: string
  project_id?: string
  contact_id?: string
  subject: string
  description?: string
  priority: TicketPriority
  status: TicketStatus
  assignee_id?: string
  resolved_at?: string
  created_at: string
  updated_at: string
  company?: Company
  contact?: Contact
  assignee?: User
  replies?: TicketReply[]
}

export interface TicketReply {
  id: string
  ticket_id: string
  author_type: 'team' | 'client'
  author_user_id?: string
  author_contact_id?: string
  content: string
  created_at: string
  author_user?: User
  author_contact?: Contact
}

export type SocialPlatform = 'instagram' | 'facebook' | 'linkedin' | 'x' | 'google_business'
export type SocialPostStatus =
  | 'draft'
  | 'pending_internal_review'
  | 'pending_client_approval'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'changes_requested'
  | 'rejected'

export interface SocialPost {
  id: string
  company_id: string
  project_id?: string
  caption?: string
  platform: SocialPlatform
  status: SocialPostStatus
  media_urls?: string[]
  scheduled_at?: string
  published_at?: string
  platform_post_id?: string
  created_by?: string
  created_at: string
  updated_at: string
  company?: Company
  approval?: SocialApproval
}

export interface SocialApproval {
  id: string
  social_post_id: string
  contact_id?: string
  token: string
  status: 'pending' | 'approved' | 'changes_requested'
  response_message?: string
  responded_at?: string
  expires_at: string
  created_at: string
}

export type PricingType = 'fixed' | 'subscription' | 'hourly'

export interface Service {
  id: string
  name: string
  description?: string
  pricing_type: PricingType
  fixed_price?: number
  hourly_rate?: number
  monthly_fee?: number
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Package {
  id: string
  name: string
  description?: string
  monthly_price?: number
  is_active: boolean
  is_embeddable: boolean
  sort_order: number
  created_at: string
  updated_at: string
  services?: PackageService[]
}

export interface PackageService {
  id: string
  package_id: string
  service_id: string
  quantity: number
  scope_description?: string
  sort_order: number
  service?: Service
}

export interface Invoice {
  id: string
  company_id: string
  xero_invoice_id?: string
  invoice_number?: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'voided'
  amount: number
  amount_paid: number
  currency: string
  issue_date?: string
  due_date?: string
  paid_date?: string
  xero_synced_at?: string
  created_at: string
  updated_at: string
  company?: Company
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message?: string
  entity_type?: string
  entity_id?: string
  read: boolean
  created_at: string
}
