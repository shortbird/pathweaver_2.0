import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { ClassList, ClassDetailPage } from '../components/classes'
import StudentClassesView from '../components/classes/StudentClassesView'

/**
 * AdvisorClassesPage - Classes page for advisors and students
 *
 * Advisors: Shows classes they're assigned to with management controls.
 * Students: Shows classes they're enrolled in with progress and quests.
 */
export default function AdvisorClassesPage() {
  const { user } = useAuth()
  const [selectedClass, setSelectedClass] = useState(null)

  const orgId = user?.organization_id

  // Determine effective role for view selection
  const effectiveRole = user?.role === 'org_managed'
    ? (user?.org_role || user?.org_roles?.[0])
    : user?.role

  const isStudent = effectiveRole === 'student'

  // Student view
  if (isStudent) {
    return <StudentClassesView />
  }

  // Advisor/admin view
  if (selectedClass) {
    return (
      <ClassDetailPage
        classId={selectedClass.id}
        orgId={selectedClass.organization_id || orgId}
        onBack={() => setSelectedClass(null)}
      />
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ClassList
        orgId={orgId}
        isAdvisorView={true}
        onSelectClass={setSelectedClass}
      />
    </div>
  )
}
