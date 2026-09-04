/**
 * Extracted from pages/courses/CourseHomepage.jsx on 2026-09-04 (QF-02).
 * That file was 1,654 lines with five components in it; this is one of them,
 * moved verbatim. No behaviour changed -- only the address.
 */

const stripHtml = (html) => {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}

export default stripHtml
