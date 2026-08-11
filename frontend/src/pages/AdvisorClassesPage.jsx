import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ClassList, ClassDetailPage } from '../components/classes'
import StudentClassesView from '../components/classes/StudentClassesView'

/**
 * AdvisorClassesPage - Classes page for advisors and students
 *
 * Advisors: Shows classes they're assigned to with management controls.
 * Students: Shows classes they're enrolled in with progress and quests.
 *
 * Routed at /org-classes and /org-classes/:classId — the param deep-links
 * straight into a class detail (Teacher Home links here), and selecting a
 * class from the list pushes the URL so detail views are shareable and
 * back-button friendly.
 */
export default function AdvisorClassesPage() {
  const { user } = useAuth()
  const { classId } = useParams()
  const navigate = useNavigate()
  // Selection from the list carries the full class row (has organization_id);
  // a URL deep link only carries the id — ClassDetailPage falls back to the
  // advisor's own org for that case.
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
  const activeClassId = classId || selectedClass?.id
  if (activeClassId) {
    return (
      <ClassDetailPage
        classId={activeClassId}
        orgId={(selectedClass?.id === activeClassId && selectedClass?.organization_id) || orgId}
        onBack={() => {
          setSelectedClass(null)
          navigate('/org-classes')
        }}
      />
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ClassList
        orgId={orgId}
        isAdvisorView={true}
        onSelectClass={(cls) => {
          setSelectedClass(cls)
          navigate(`/org-classes/${cls.id}`)
        }}
      />
    </div>
  )
}
