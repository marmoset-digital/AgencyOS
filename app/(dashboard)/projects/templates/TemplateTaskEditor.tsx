'use client'

// Controlled editor for a template's task list. The parent owns the rows array.
// Numeric fields are kept as strings so the inputs stay easy to type in; the
// parent converts them to numbers when saving.

export type EditorRow = {
  title: string
  description: string
  priority: string
  estimate: string // minutes, as typed
  offset: string   // due day = days from project start, as typed
}

export const BLANK_ROW: EditorRow = { title: '', description: '', priority: 'medium', estimate: '', offset: '' }

export default function TemplateTaskEditor({
  rows,
  onChange,
}: {
  rows: EditorRow[]
  onChange: (rows: EditorRow[]) => void
}) {
  function update(i: number, patch: Partial<EditorRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function add() {
    onChange([...rows, { ...BLANK_ROW }])
  }
  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i))
  }
  function move(i: number, dir: 'up' | 'down') {
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= rows.length) return
    const copy = rows.slice()
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    onChange(copy)
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-xs text-gray-400">No tasks yet — add one below.</p>}

      {rows.map((r, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-2 bg-gray-50/60">
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, 'up')} disabled={i === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs" title="Move up">▲</button>
              <button type="button" onClick={() => move(i, 'down')} disabled={i === rows.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs" title="Move down">▼</button>
            </div>
            <input value={r.title} onChange={e => update(i, { title: e.target.value })} placeholder="Task title" className="input text-sm flex-1" />
            <select value={r.priority} onChange={e => update(i, { priority: e.target.value })} className="input text-sm w-24">
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button type="button" onClick={() => remove(i)} title="Remove task" className="text-gray-300 hover:text-red-500 text-sm px-1">✕</button>
          </div>
          <div className="flex items-center gap-2 mt-2 pl-6">
            <input value={r.description} onChange={e => update(i, { description: e.target.value })} placeholder="Description (optional)" className="input text-xs flex-1" />
            <input value={r.estimate} onChange={e => update(i, { estimate: e.target.value })} type="number" min="0" placeholder="Est. min" title="Estimate in minutes" className="input text-xs w-24" />
            <input value={r.offset} onChange={e => update(i, { offset: e.target.value })} type="number" placeholder="Due day" title="Due date = this many days from the project start (0 = start day)" className="input text-xs w-24" />
          </div>
        </div>
      ))}

      <button type="button" onClick={add} className="text-xs text-[#254DA5] hover:underline font-medium">+ Add task</button>
    </div>
  )
}
