import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from '../../pages/sis/sisRole'
import { getPreviewTeacher } from '../../pages/sis/teacherPreview'

/**
 * "← Teacher dashboard" — the way back from a teacher-portal page.
 *
 * iCreate filed this three times in two minutes (2026-07-31), from /my-classes,
 * /forms and /onboarding: "No way to get back to the teacher dashboard from
 * this page." The sidebar does have a Dashboard link, but it is a generic nav
 * item that sits behind a drawer on a narrow screen and reads as "Dashboard" —
 * you don't find it when what you want is the page you just came from. The
 * class page already had "← My Classes" and nobody complained about that one.
 *
 * The label follows what `/` will actually render for this viewer: an admin
 * who is NOT previewing a teacher gets the School Dashboard, so promising them
 * a "teacher dashboard" would be a lie.
 */
const BackToDashboard = ({ className = '' }) => {
  const { user } = useAuth()
  const teacherView = !isSisAdmin(user) || Boolean(getPreviewTeacher())
  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-1 text-sm text-optio-purple hover:underline ${className}`}
    >
      <span aria-hidden="true">←</span>
      {teacherView ? 'Teacher dashboard' : 'Dashboard'}
    </Link>
  )
}

export default BackToDashboard
