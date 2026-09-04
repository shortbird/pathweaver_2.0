/**
 * Extracted from pages/ScheduleBuilderPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

const fmtDate = (d) => {
  try { return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

// A clicked slot on the calendar: f = { day, min, end }.

export default fmtDate
