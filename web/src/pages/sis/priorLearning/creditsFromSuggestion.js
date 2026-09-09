/**
 * Extracted from sis/PriorLearningPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

/** A suggestion's subjects as the credit boxes hold them: {subject: "1.0"}. */
export const creditsFromSuggestion = (suggestion) => Object.fromEntries(
  (suggestion?.subjects || [])
    .filter((s) => Number(s.credits) > 0)
    .map((s) => [s.subject, String(s.credits)])
)

export default creditsFromSuggestion
