export interface TaskComment {
  id: string
  entity_type: string
  entity_id: string
  author_id: string | null
  content: string
  mentions: string[] | null
  created_at: string
  author?: { full_name: string } | null
}
