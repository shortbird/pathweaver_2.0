/**
 * Extracted from sis/PriorLearningPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

const courseTotal = (list) => (
  Math.round((list || []).reduce((sum, c) => sum + (Number(c.credits) || 0), 0) * 100) / 100
)

export default courseTotal
