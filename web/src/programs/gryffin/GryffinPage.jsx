import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ClassList, ClassDetailPage } from '../../components/classes'
import StudentClassesView from '../../components/classes/StudentClassesView'
import StudentAgenda from '../../components/classes/StudentAgenda'

// Who gets the class MANAGER (rosters, quests, settings) on this page. It reads
// /api/advisor/classes, which is @require_role(*STAFF_ROLES) on the backend, so
// anybody outside this set gets a 403 and an empty page rather than a smaller
// one. Matched to sis_roles.STAFF_ROLES deliberately: the page must not be more
// generous than the endpoint behind it.
const STAFF_ROLES = ['advisor', 'org_admin', 'campus_coordinator', 'superadmin']

/**
 * GryffinPage - Gryffin Learning Center hub (org slug 'gryffin').
 *
 * Shown in the sidebar to Gryffin org members (gated by slug). Students see the
 * classes they're enrolled in and the quests their teachers have assigned (only
 * quests whose scheduled publish time has arrived). Advisors get the class list +
 * roster/quest management for their classes.
 */
export default function GryffinPage() {
  const { user, effectiveRoles } = useAuth()
  const { classId } = useParams()
  const [selectedClass, setSelectedClass] = useState(null)

  const orgId = user?.organization_id
  const roles = effectiveRoles || []
  const isStudent = roles.includes('student')
  // Read the FULL role list, not a single primary role. A teacher who is also a
  // parent at the school carries org_role='parent' with 'advisor' only in the
  // array, and judging them on the singular column alone would send them to the
  // family view instead of their own classes -- the same mistake credit_messages
  // made (Sentry OPTIO-WEB-7/8).
  const isStaff = roles.some((r) => STAFF_ROLES.includes(r))

  // Everyone else who can reach this tab is family: a parent or an observer.
  // They used to fall through to the staff branch and get a 403 from
  // /api/advisor/classes, so the school's own page answered a parent with
  // "Failed to load classes" (Sentry OPTIO-WEB-16 -- a Gryffin parent, 2026-09-10).
  // The class list they want is per-child and already exists on the parent
  // dashboard, so send them there rather than build a second one here.
  const subtitle = isStudent
    ? 'Your classes and the quests your teachers have assigned.'
    : isStaff
      ? 'Manage your classes, rosters, and assigned quests.'
      : "Your children's classes, quests, and progress."

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent">
          Gryffin Learning Center
        </h1>
        <p className="text-gray-600 mt-1">{subtitle}</p>
      </div>

      {isStudent ? (
        <>
          {!classId && <StudentAgenda basePath="/gryffin" />}
          <StudentClassesView basePath="/gryffin" />
        </>
      ) : !isStaff ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-700">
            Each child&apos;s classes, assigned quests, and progress live on their
            overview.
          </p>
          <Link
            to="/parent/dashboard"
            className="inline-block mt-4 px-5 py-2.5 rounded-lg text-white font-medium bg-gradient-to-r from-optio-purple to-optio-pink"
          >
            Go to my children
          </Link>
        </div>
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
