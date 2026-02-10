import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { ClassList, ClassDetailPage } from '../components/classes'

/**
 * AdvisorClassesPage - List of classes for advisors
 *
 * Shows all classes the current user is assigned to as an advisor.
 * Clicking a class opens the detail view.
 */
export default function AdvisorClassesPage() {
  const { user } = useAuth()
  const [selectedClass, setSelectedClass] = useState(null)

  // If user has org, use that for API calls
  const orgId = user?.organization_id

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
