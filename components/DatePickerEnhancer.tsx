'use client'

import { useEffect } from 'react'

// System-wide UX: clicking anywhere in a date/time field opens the native picker,
// not only the little calendar icon. Progressive enhancement — browsers without
// showPicker() (e.g. older Safari) just keep the default behaviour. Mounted once
// in the dashboard layout; a single delegated listener covers every date input.
export default function DatePickerEnhancer() {
  useEffect(() => {
    function open(e: Event) {
      const el = e.target as HTMLElement | null
      if (
        el instanceof HTMLInputElement &&
        ['date', 'datetime-local', 'month', 'time', 'week'].includes(el.type) &&
        !el.readOnly &&
        !el.disabled
      ) {
        try {
          el.showPicker()
        } catch {
          // not supported, or not a trusted user gesture — ignore
        }
      }
    }
    document.addEventListener('click', open)
    return () => document.removeEventListener('click', open)
  }, [])

  return null
}
