/**
 * Extracted from sis/PriorLearningPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

/** Course rows, in the order a transcript reads: by subject, then as listed. */
export const transcriptRows = (suggestion) => (suggestion?.subjects || []).flatMap((s) => {
  const courses = s.courses || []
  // A subject the model credited without naming a course still gets a line —
  // it is credit being proposed, and a row missing from the table is credit a
  // reviewer approves without ever seeing it.
  if (!courses.length) {
    return [{
      subject: s.subject, name: '—', credits: s.credits,
      term: null, confidence: s.confidence, rationale: s.rationale,
    }]
  }
  return courses.map((c) => ({
    subject: s.subject, name: c.name, credits: c.credits,
    term: c.term, confidence: s.confidence, rationale: s.rationale,
  }))
})

export default transcriptRows
