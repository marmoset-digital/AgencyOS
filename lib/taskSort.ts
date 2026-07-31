// Shared task sorting for the project board list and the global Tasks list.
// Both call sortTasks() with a small getter that maps their own row shape to the
// common fields, so the comparators live in one place.

export type SortKey = 'title' | 'priority' | 'assignee' | 'due' | 'time' | 'status'
export type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }
const STATUS_RANK: Record<string, number> = { todo: 0, in_progress: 1, done: 2 }

// Click cycles: asc → desc → off (back to the default order).
export function nextSort(cur: SortState, key: SortKey): SortState {
  if (cur && cur.key === key) return cur.dir === 'asc' ? { key, dir: 'desc' } : null
  return { key, dir: 'asc' }
}

export type SortFields = {
  title: string
  priority: string
  assignee: string
  due: string | null // YYYY-MM-DD or null
  minutes: number
  status: string
}

export function sortTasks<T>(items: T[], sort: SortState, fields: (t: T) => SortFields): T[] {
  if (!sort) return items
  const { key, dir } = sort
  const sign = dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    const fa = fields(a)
    const fb = fields(b)
    switch (key) {
      case 'title': return fa.title.localeCompare(fb.title) * sign
      case 'assignee': return fa.assignee.localeCompare(fb.assignee) * sign
      case 'priority': return ((PRIORITY_RANK[fa.priority] ?? 9) - (PRIORITY_RANK[fb.priority] ?? 9)) * sign
      case 'status': return ((STATUS_RANK[fa.status] ?? 9) - (STATUS_RANK[fb.status] ?? 9)) * sign
      case 'time': return (fa.minutes - fb.minutes) * sign
      case 'due':
        // Undated tasks always sort last, whichever direction.
        if (!fa.due && !fb.due) return 0
        if (!fa.due) return 1
        if (!fb.due) return -1
        return fa.due.localeCompare(fb.due) * sign
      default: return 0
    }
  })
}
