'use client'

import type { SortKey, SortState } from '@/lib/taskSort'

// A table header you can click to sort. Shows a neutral ↕ when inactive and ↑/↓
// for the active column + direction.
export default function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  className = '',
}: {
  label: string
  sortKey: SortKey
  sort: SortState
  onSort: (k: SortKey) => void
  className?: string
}) {
  const active = sort?.key === sortKey
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-gray-700 select-none"
      >
        {label}
        <span className={active ? 'text-gray-600' : 'text-gray-300'}>
          {active ? (sort!.dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}
