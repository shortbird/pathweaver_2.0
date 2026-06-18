import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import EnrollStudentForm from '../components/partner/EnrollStudentForm'

/**
 * PartnerEnrollStudentPage
 *
 * Standalone page wrapper around EnrollStudentForm for a partner program's
 * org_admin to register a student and enroll them in Optio courses.
 */
export default function PartnerEnrollStudentPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const orgId = searchParams.get('org') || user?.organization_id

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Register a Student</h1>
        <p className="text-sm text-gray-600 mt-1">
          Enter the student's details and choose the course(s) they purchased. The student gets an
          email with their login and an overview of how Optio works. Already have an account on this
          email? We'll just add the new course(s).
        </p>
      </div>

      <EnrollStudentForm orgId={orgId} />
    </div>
  )
}
