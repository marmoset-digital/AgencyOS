export type RecurringFrequency = 'daily' | 'weekly' | 'fortnightly' | 'monthly'

export interface RecurringTemplate {
  id: string
  project_id: string | null
  company_id: string | null
  title: string
  description: string | null
  assignee_id: string | null
  frequency: RecurringFrequency
  day_of_week: number | null   // 0=Sun .. 6=Sat (weekly/fortnightly)
  day_of_month: number | null  // 1..31 (monthly)
  priority: 'high' | 'medium' | 'low'
  time_estimate: number | null
  active: boolean
  last_generated_at: string | null
  created_at: string
}
