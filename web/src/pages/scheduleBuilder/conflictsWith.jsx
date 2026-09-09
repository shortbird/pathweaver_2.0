/**
 * Extracted from pages/ScheduleBuilderPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import toMin from './toMin'

const conflictsWith = (candidate, current) => {
  for (const cm of candidate.meetings || []) {
    if (cm.day_of_week == null) continue
    const cs = toMin(cm.start_time); const ce = toMin(cm.end_time)
    if (cs == null || ce == null) continue
    for (const cls of current) {
      for (const m of cls.meetings || []) {
        if (m.day_of_week !== cm.day_of_week) continue
        const s = toMin(m.start_time); const e = toMin(m.end_time)
        if (s == null || e == null) continue
        if (cs < e && s < ce) return cls.name
      }
    }
  }
  return null
}

export default conflictsWith
