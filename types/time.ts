// Time tracking types

export interface TimeLog {
  id: string
  task_id?: string | null
  project_id: string
  user_id: string
  duration_minutes: number
  description?: string | null
  is_billable: boolean
  logged_at: string
  created_at: string
  updated_at: string
}

export interface ActiveTimer {
  id: string
  user_id: string
  task_id?: string | null
  project_id: string
  description?: string | null
  started_at: string
  created_at: string
}
