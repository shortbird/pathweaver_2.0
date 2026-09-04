/**
 * Extracted from pages/ScheduleBuilderPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

const toMin = (t) => {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return Number.isNaN(h) ? null : h * 60 + (m || 0)
}

// Does candidate overlap any of the student's current meetings?

export default toMin
