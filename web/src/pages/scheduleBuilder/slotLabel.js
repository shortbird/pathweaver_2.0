/**
 * Extracted from pages/ScheduleBuilderPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import SLOT_DAYS from './SLOT_DAYS'
import fmtHour from './fmtHour'
import slotEnd from './slotEnd'

const slotLabel = (f) => `${SLOT_DAYS[f.day]} ${fmtHour(f.min)}–${fmtHour(slotEnd(f))}`

// The student's age as of a date (first day of school when known — families
// register for the coming year, so "is my kid old enough" is judged then).

export default slotLabel
