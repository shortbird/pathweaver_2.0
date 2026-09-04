/**
 * Extracted from sis/PriorLearningPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

/**
 * "US History (1.0), Government (0.5)" -> [{name, credits}], per subject.
 *
 * Free text rather than a row editor: a reviewer correcting one course name
 * shouldn't have to work a grid. Anything without a "(credits)" suffix parses
 * to nothing, which shows up as a total that doesn't match — visible before
 * saving rather than as a rejection afterwards.
 */
export const parseCourseText = (bySubject) => {
  const out = {}
  for (const [subject, text] of Object.entries(bySubject || {})) {
    const list = String(text || '').split(',').map((chunk) => {
      const m = chunk.trim().match(/^(.*?)\s*\(([\d.]+)\)$/)
      return m && m[1].trim() ? { name: m[1].trim(), credits: parseFloat(m[2]) } : null
    }).filter(Boolean)
    if (list.length) out[subject] = list
  }
  return out
}

export default parseCourseText
