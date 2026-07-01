import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ClassList, ClassDetailPage } from '../../components/classes'
import StudentClassesView from '../../components/classes/StudentClassesView'
import StudentAgenda from '../../components/classes/StudentAgenda'

/**
 * GryffinPage - Gryffin Learning Center hub (org slug 'gryffin').
 *
 * Shown in the sidebar to Gryffin org members (gated by slug). Students see the
 * classes they're enrolled in and the quests their teachers have assigned (only
 * quests whose scheduled publish time has arrived). Advisors get the class list +
 * roster/quest management for their classes.
 */
export default function GryffinPage() {
  const { user } = useAuth()
  const { classId } = useParams()
  const [selectedClass, setSelectedClass] = useState(null)

  const orgId = user?.organization_id
  const effectiveRole = user?.role === 'org_managed'
    ? (user?.org_role || user?.org_roles?.[0])
    : user?.role
  const isStudent = effectiveRole === 'student'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent">
          Gryffin Learning Center
        </h1>
        <p className="text-gray-600 mt-1">
          {isStudent
            ? 'Your classes and the quests your teachers have assigned.'
            : 'Manage your classes, rosters, and assigned quests.'}
        </p>
      </div>

      {isStudent ? (
        <>
          {!classId && <StudentAgenda basePath="/gryffin" />}
          <StudentClassesView basePath="/gryffin" />
        </>
      ) : selectedClass ? (
        <ClassDetailPage
          classId={selectedClass.id}
          orgId={selectedClass.organization_id || orgId}
          onBack={() => setSelectedClass(null)}
        />
      ) : (
        <ClassList orgId={orgId} isAdvisorView={true} onSelectClass={setSelectedClass} />
      )}
    </div>
  )
}
