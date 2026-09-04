/**
 * Extracted from sis/ClassesPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import CreateClassModal from '../../../components/sis/CreateClassModal'
import CourseDetailModal from './CourseDetailModal'

const CLASS_TABS = [
  { key: 'details', label: 'Details' },
  { key: 'roster', label: 'Roster' },
  { key: 'waitlist', label: 'Waitlist' },
]

// Same shell as CourseDetailModal, but a class is org-owned so every field is
// editable (the embedded CreateClassModal form), plus registration + archive.
// "Preview" renders the exact read-only modal parents and students see in the
// Schedule Builder.

export default CLASS_TABS
