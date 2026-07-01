/**
 * OEA credits dashboard for one student, parent (editable) view
 * (/opened-academy/student/:studentId/credits).
 *
 * Thin wrapper that titles the page and renders the shared OEACreditsView in
 * editable mode. The student's own read-only view reuses OEACreditsView
 * directly from the OEA landing page.
 */
import React from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import OEACreditsView from './OEACreditsView'

export default function OEACreditsPage() {
  const navigate = useNavigate()
  const { studentId } = useParams()
  const location = useLocation()
  const studentName = location.state?.studentName

  const title = studentName ? `${studentName}'s credits` : 'Diploma credits'

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 font-poppins">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
        <button
          type="button"
          onClick={() => navigate('/opened-academy')}
          className="text-sm text-optio-purple font-medium"
        >
          Back
        </button>
      </div>
      <div className="mt-6">
        <OEACreditsView studentId={studentId} studentName={studentName} />
      </div>
    </div>
  )
}
