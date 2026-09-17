import { useCallback, useState } from 'react'

/**
 * A UI choice that survives a reload: which columns to export, cards or
 * table, which sort. Stored per browser in localStorage, read once on mount,
 * written on every change, and silent when storage is refused (private
 * mode, a locked-down browser) -- the choice still works for the session.
 *
 * Seven SIS pages each wrote this try/JSON.parse/JSON.stringify by hand
 * (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, K5). `validate` is the one
 * thing that differed: given what storage held, return the value to use or
 * null to fall back to `initial`. Use it to drop a column the caller may no
 * longer export, or a sort the dropdown no longer offers -- a stale value
 * must never wedge a page into a state it has no control for.
 */
export default function usePersistedChoice(key, initial, { validate = null } = {}) {
  const [value, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return initial
      let parsed
      // Two of the view toggles stored a bare word before this hook existed;
      // a value that is not JSON is taken as the string it is.
      try { parsed = JSON.parse(raw) } catch { parsed = raw }
      const checked = validate ? validate(parsed) : parsed
      return checked == null ? initial : checked
    } catch {
      return initial
    }
  })

  const setValue = useCallback((next) => {
    setState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next
      try { localStorage.setItem(key, JSON.stringify(resolved)) } catch { /* storage refused */ }
      return resolved
    })
  }, [key])

  return [value, setValue]
}
