// CSV import for Project Templates. Pure, framework-agnostic TypeScript so it can run
// in the browser (parse + validate before anything is written) and be unit-tested.
//
// Maps the CSV spec's nine columns onto the existing template model:
//   template_name        -> template.name
//   template_type        -> content.type            (retainer | project | null)
//   template_description -> template.description
//   task_order           -> position in content.tasks (re-sequenced 1..n on write)
//   task_title           -> task.title
//   priority             -> task.priority           (high | medium | low, default medium)
//   task_description     -> task.description
//   est_min              -> task.time_estimate      (minutes, null allowed)
//   due_day              -> task.due_offset_days     (days from start; 0 = start day; null = none)

export type ImportTask = {
  title: string
  description: string | null
  priority: string
  time_estimate: number | null
  due_offset_days: number | null
}

export type ImportTemplate = {
  name: string
  type: string | null
  description: string | null
  tasks: ImportTask[]
}

export type ImportPlan = {
  ok: boolean
  templates: ImportTemplate[]
  errors: string[]
  warnings: string[]
}

export const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
export const MAX_ROWS = 2000

const PRIORITIES = ['high', 'medium', 'low']
const TYPES = ['retainer', 'project']
const REQUIRED_HEADERS = ['template_name', 'task_order', 'task_title']

// RFC-4180 CSV parser: handles quoted fields, escaped quotes (""), commas and
// newlines inside quotes, and CRLF or LF line endings. Returns rows of raw cells.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  // Strip a UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ }
        else inQuotes = false
      } else {
        cell += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(cell); cell = ''
    } else if (c === '\n') {
      row.push(cell); cell = ''; rows.push(row); row = []
    } else if (c === '\r') {
      // swallow; the \n (if any) finishes the row
    } else {
      cell += c
    }
  }
  // Final cell/row (unless the file ended exactly on a newline with nothing after).
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows
}

function isBlank(s: string | undefined): boolean {
  return s === undefined || s.trim() === ''
}

// Parse an integer that must be a whole number with no stray characters ("3" ok, "day 3" not).
function toInt(s: string): number | null {
  const t = s.trim()
  if (!/^-?\d+$/.test(t)) return null
  return parseInt(t, 10)
}

/**
 * Parse + validate a CSV string into an import plan.
 * If `errors` is non-empty the whole file is rejected and nothing should be written.
 */
export function buildImportPlan(text: string): ImportPlan {
  const errors: string[] = []
  const warnings: string[] = []

  if (text.length > MAX_BYTES) {
    return { ok: false, templates: [], errors: [`File is larger than ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`], warnings: [] }
  }

  const grid = parseCsv(text).filter(r => !(r.length === 1 && r[0].trim() === '')) // drop wholly blank lines
  if (grid.length === 0) return { ok: false, templates: [], errors: ['The file is empty.'], warnings: [] }

  const header = grid[0].map(h => h.trim().toLowerCase())
  const dataRows = grid.slice(1)

  if (dataRows.length > MAX_ROWS) {
    return { ok: false, templates: [], errors: [`File has ${dataRows.length} rows; the limit is ${MAX_ROWS}.`], warnings: [] }
  }

  // Required headers present?
  const missing = REQUIRED_HEADERS.filter(h => !header.includes(h))
  if (missing.length) {
    return { ok: false, templates: [], errors: [`Missing required column(s): ${missing.join(', ')}.`], warnings: [] }
  }

  const col = (name: string) => header.indexOf(name)
  const ix = {
    template_name: col('template_name'),
    template_type: col('template_type'),
    template_description: col('template_description'),
    task_order: col('task_order'),
    task_title: col('task_title'),
    priority: col('priority'),
    task_description: col('task_description'),
    est_min: col('est_min'),
    due_day: col('due_day'),
  }
  const get = (r: string[], i: number) => (i >= 0 && i < r.length ? r[i] : '')

  type StagedTask = {
    order: number; title: string; description: string | null
    priority: string; est: number | null; due: number | null
  }
  type StagedGroup = {
    name: string; type: string | null; description: string | null
    typeSet: boolean; descSet: boolean; orders: Set<number>; tasks: StagedTask[]
  }
  const groups = new Map<string, StagedGroup>()
  const order: string[] = [] // first-appearance order of template names

  dataRows.forEach((r, i) => {
    const rowNum = i + 2 // 1-based incl. header

    const name = get(r, ix.template_name).trim()
    if (!name) { errors.push(`Row ${rowNum}: template_name is blank.`); return }
    const title = get(r, ix.task_title).trim()
    if (!title) { errors.push(`Row ${rowNum}: task_title is blank.`); return }

    const orderRaw = get(r, ix.task_order)
    const orderVal = toInt(orderRaw)
    if (orderVal === null) { errors.push(`Row ${rowNum}: task_order "${orderRaw.trim()}" is not an integer.`); return }

    let est: number | null = null
    if (!isBlank(get(r, ix.est_min))) {
      const v = toInt(get(r, ix.est_min))
      if (v === null) { errors.push(`Row ${rowNum}: est_min "${get(r, ix.est_min).trim()}" is not an integer.`); return }
      est = v
      if (v > 600) warnings.push(`Row ${rowNum}: est_min ${v} is over 600 — check hours weren't entered as minutes.`)
    }

    let due: number | null = null
    if (!isBlank(get(r, ix.due_day))) {
      const v = toInt(get(r, ix.due_day))
      if (v === null) { errors.push(`Row ${rowNum}: due_day "${get(r, ix.due_day).trim()}" is not an integer.`); return }
      due = v
    }

    let priority = 'medium'
    if (!isBlank(get(r, ix.priority))) {
      const p = get(r, ix.priority).trim().toLowerCase()
      if (!PRIORITIES.includes(p)) { errors.push(`Row ${rowNum}: priority "${get(r, ix.priority).trim()}" must be high, medium or low.`); return }
      priority = p
    }

    let type: string | null = null
    if (!isBlank(get(r, ix.template_type))) {
      const t = get(r, ix.template_type).trim().toLowerCase()
      if (!TYPES.includes(t)) { errors.push(`Row ${rowNum}: template_type "${get(r, ix.template_type).trim()}" must be retainer or project.`); return }
      type = t
    }

    const key = name.toLowerCase()
    let g = groups.get(key)
    if (!g) {
      g = { name, type: null, description: null, typeSet: false, descSet: false, orders: new Set(), tasks: [] }
      groups.set(key, g)
      order.push(key)
    }

    // Template-level fields: take first non-blank; warn on conflict.
    if (type !== null) {
      if (!g.typeSet) { g.type = type; g.typeSet = true }
      else if (g.type !== type) warnings.push(`Template "${g.name}": conflicting template_type values; using "${g.type}".`)
    }
    const descRaw = get(r, ix.template_description).trim()
    if (descRaw) {
      if (!g.descSet) { g.description = descRaw; g.descSet = true }
      else if (g.description !== descRaw) warnings.push(`Template "${g.name}": conflicting template_description values; using the first.`)
    }

    if (g.orders.has(orderVal)) { errors.push(`Row ${rowNum}: task_order ${orderVal} is repeated in template "${g.name}".`); return }
    g.orders.add(orderVal)

    g.tasks.push({
      order: orderVal,
      title,
      description: get(r, ix.task_description).trim() || null,
      priority,
      est,
      due,
    })
  })

  if (errors.length) return { ok: false, templates: [], errors, warnings }

  const templates: ImportTemplate[] = order.map(key => {
    const g = groups.get(key)!
    const sorted = [...g.tasks].sort((a, b) => a.order - b.order)
    // Warn on gaps / non-1..n numbering (we re-sequence regardless).
    const gappy = sorted.some((t, idx) => t.order !== idx + 1)
    if (gappy) warnings.push(`Template "${g.name}": task_order was re-sequenced to 1..${sorted.length}.`)
    return {
      name: g.name,
      type: g.type,
      description: g.description,
      tasks: sorted.map(t => ({
        title: t.title,
        description: t.description,
        priority: t.priority,
        time_estimate: t.est,
        due_offset_days: t.due,
      })),
    }
  })

  return { ok: true, templates, errors: [], warnings }
}
