/**
 * Extracted from sis/ClassesPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

const COURSE_TABS = [
  { key: 'details', label: 'Details' },
  { key: 'manage', label: 'Enrollments' },
]

// Tuition is intentionally not shown here: SIS staff manage the teacher and
// rosters; the price surfaces in the parent-facing schedule builder instead.
// "View as student" opens the course in the real student view (CourseHomepage),
// so staff can review it or demo it without enrolling themselves.

export default COURSE_TABS
