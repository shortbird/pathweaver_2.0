/**
 * The family's per-student add-on choices on the funnel's payment step, as
 * the page holds them: { [studentId]: [addOnKeys] }. No money here -- the
 * server prices a selection (hooks/api/useRegistrationQuote); these only
 * shape what was ticked.
 */

// Toggle one add-on for one student in a { [studentId]: [keys] } selection.
export const toggleAddOn = (selection, studentId, key, on) => {
  const current = new Set(selection?.[studentId] || [])
  if (on) current.add(key); else current.delete(key)
  return { ...(selection || {}), [studentId]: [...current].sort() }
}

// Students as the payment step shows them, from the funnel's server-known
// kids (or, in preview, the local kid cards) plus the family's current
// selection: [{ id, name, add_ons }]. The same list is what a quote request
// sends as `kids`.
export const studentsForPricing = (kids, selection) => (kids || []).map((k) => {
  const id = k.user_id || k._key || k.id
  return {
    id,
    name: k.preferred_name || k.first_name || (k.name || '').split(' ')[0] || 'Student',
    add_ons: selection?.[id] || k.add_ons || [],
  }
})

// The selection as the server stored it on the kids.
export const addOnsFromKids = (kids) => Object.fromEntries(
  (kids || []).filter((k) => k.user_id).map((k) => [k.user_id, k.add_ons || []]))
