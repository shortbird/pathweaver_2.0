import React, { memo, useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { UserGroupIcon, AcademicCapIcon } from '@heroicons/react/24/outline'
import api, { adminParentConnectionsAPI } from '../../services/api'
import AttachmentList from './AttachmentList'
import { ConfirmDialog, PageLoader } from '../ui'

/**
 * UserPeopleTab — everything this user is attached to: people and courses.
 *
 * Replaces UserConnectionsTab + UserEnrollmentsTab, which were the same
 * interaction (a list of attached things with a search-and-add drawer) written
 * twice. Both halves now render through <AttachmentList>.
 *
 * Connections come from one aggregated endpoint
 * (GET /api/admin/users/:id/connections). The client used to assemble them
 * from up to 1+N requests and swallow every failure.
 */

const CONNECTION_LABELS = {
  student: 'Student',
  child: 'Child',
  advisor: 'Teacher',
  parent: 'Parent',
  observing: 'Observing',
  observed_by: 'Observer',
}

const ADD_ACTIONS = [
  { key: 'advisor', label: 'Teacher' },
  { key: 'parent', label: 'Parent' },
  { key: 'student', label: 'Student' },
  { key: 'observer', label: 'Observer' },
]

const personName = (u) =>
  `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.display_name || 'Unknown'

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

const UserPeopleTab = ({ user }) => {
  const [loading, setLoading] = useState(true)
  const [connections, setConnections] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [confirming, setConfirming] = useState(null)

  const effectiveRole = user.org_role || user.role || 'student'

  const loadConnections = useCallback(async () => {
    const res = await api.get(`/api/admin/users/${user.id}/connections`)
    setConnections(res.data.data?.connections || [])
  }, [user.id])

  const loadEnrollments = useCallback(async () => {
    const res = await api.get(`/api/admin/courses/user-enrollments?user_id=${user.id}`)
    setEnrollments(res.data.enrollments || [])
  }, [user.id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([loadConnections(), loadEnrollments()])
      .catch(() => {
        if (!cancelled) toast.error('Failed to load connections')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadConnections, loadEnrollments])

  // --- People ------------------------------------------------------------

  const connectionItems = connections.map((c) => ({
    id: c.id,
    pill: CONNECTION_LABELS[c.direction] || c.type,
    name: c.person.name,
    sub: c.person.email,
    meta: formatDate(c.created_at),
    raw: c,
  }))

  const loadPeopleOptions = async (key) => {
    const taken = new Set(
      connections
        .filter((c) => {
          if (key === 'advisor') return c.direction === 'advisor'
          if (key === 'parent') return c.direction === 'parent'
          if (key === 'observer') return c.direction === 'observed_by'
          return c.direction === 'student' || c.direction === 'child'
        })
        .map((c) => c.person.id)
    )

    let people = []
    if (key === 'advisor') {
      const res = await api.get('/api/admin/advisors')
      people = res.data.advisors || []
    } else {
      const role = key === 'observer' ? undefined : key
      const res = await adminParentConnectionsAPI.getAllUsers({ role, per_page: 200 })
      people = res.data.users || []
    }

    return people
      .filter((p) => p.id !== user.id && !taken.has(p.id))
      .map((p) => ({ id: p.id, name: personName(p), sub: p.email }))
  }

  const addPeople = async (key, ids) => {
    try {
      if (key === 'advisor') {
        // The chosen people teach this user.
        await Promise.all(
          ids.map((id) => api.post(`/api/admin/advisors/${id}/students`, { student_id: user.id }))
        )
      } else if (key === 'parent') {
        await Promise.all(ids.map((id) => adminParentConnectionsAPI.createManualLink(id, user.id, '')))
      } else if (key === 'observer') {
        await Promise.all(
          ids.map((id) =>
            api.post(`/api/admin/users/${user.id}/observer-links`, {
              other_user_id: id,
              direction: 'observed_by',
            })
          )
        )
      } else if (effectiveRole === 'advisor' || effectiveRole === 'superadmin') {
        // This user teaches the chosen students.
        await Promise.all(
          ids.map((id) => api.post(`/api/admin/advisors/${user.id}/students`, { student_id: id }))
        )
      } else {
        // Anyone else attaching students is doing so as their parent.
        await Promise.all(ids.map((id) => adminParentConnectionsAPI.createManualLink(user.id, id, '')))
      }
      toast.success(`Added ${ids.length} connection${ids.length === 1 ? '' : 's'}`)
      await loadConnections()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add connection')
      throw error
    }
  }

  const removeConnection = async (conn) => {
    try {
      if (conn.type === 'observer') {
        await api.delete(`/api/admin/users/${user.id}/observer-links/${conn.link_id}`)
      } else if (conn.type === 'advisor') {
        await api.delete(`/api/admin/advisors/${conn.advisor_id}/students/${conn.student_id}`)
      } else {
        await adminParentConnectionsAPI.disconnectLink(conn.link_id)
      }
      toast.success('Connection removed')
      await loadConnections()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to remove connection')
      throw error
    }
  }

  // --- Courses -----------------------------------------------------------

  const enrollmentItems = enrollments.map((e) => ({
    id: e.course_id,
    pill: e.status || undefined,
    name: e.course?.title || 'Unknown course',
    meta: e.enrolled_at ? `Enrolled ${formatDate(e.enrolled_at)}` : '',
    raw: e,
  }))

  // Loaded when the drawer opens, not on tab open — the catalog is only needed
  // if someone actually enrolls.
  const loadCourseOptions = async () => {
    const res = await api.get('/api/courses?filter=admin_all')
    const enrolled = new Set(enrollments.map((e) => e.course_id))
    return (res.data.courses || [])
      .filter((c) => c.status === 'published' && !enrolled.has(c.id))
      .map((c) => ({ id: c.id, name: c.title, sub: c.description }))
  }

  const addCourses = async (_key, ids) => {
    try {
      await Promise.all(
        ids.map((courseId) =>
          api.post(`/api/admin/courses/${courseId}/bulk-enroll`, { user_ids: [user.id] })
        )
      )
      toast.success(`Enrolled in ${ids.length} course${ids.length === 1 ? '' : 's'}`)
      await loadEnrollments()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to enroll')
      throw error
    }
  }

  const removeEnrollment = async (enrollment) => {
    try {
      await api.post(`/api/admin/courses/${enrollment.course_id}/bulk-unenroll`, {
        user_ids: [user.id],
      })
      toast.success('Unenrolled')
      await loadEnrollments()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to unenroll')
      throw error
    }
  }

  if (loading) return <PageLoader label="Loading connections" className="min-h-[200px]" />

  return (
    <div className="space-y-8">
      <AttachmentList
        title="People"
        items={connectionItems}
        addActions={ADD_ACTIONS}
        loadOptions={loadPeopleOptions}
        onAdd={addPeople}
        onRemove={(item) =>
          setConfirming({
            title: 'Remove connection?',
            body: `${item.name} will no longer be linked to this user as ${(
              CONNECTION_LABELS[item.raw.direction] || item.raw.type
            ).toLowerCase()}.`,
            confirmLabel: 'Remove',
            run: () => removeConnection(item.raw),
          })
        }
        emptyIcon={UserGroupIcon}
        emptyTitle="No connections"
        emptyHint="Add a teacher, parent, student, or observer."
      />

      <AttachmentList
        title="Courses"
        items={enrollmentItems}
        addActions={[{ key: 'course', label: 'Enroll in course' }]}
        loadOptions={loadCourseOptions}
        onAdd={addCourses}
        onRemove={(item) =>
          setConfirming({
            title: 'Remove from course?',
            body: `${item.name} will be unenrolled. Their completed work is kept.`,
            confirmLabel: 'Unenroll',
            run: () => removeEnrollment(item.raw),
          })
        }
        emptyIcon={AcademicCapIcon}
        emptyTitle="No course enrollments"
        emptyHint="Enroll this user in a published course."
      />

      <ConfirmDialog
        isOpen={!!confirming}
        onClose={() => setConfirming(null)}
        title={confirming?.title}
        confirmLabel={confirming?.confirmLabel}
        destructive
        onConfirm={() => confirming.run()}
      >
        <p>{confirming?.body}</p>
      </ConfirmDialog>
    </div>
  )
}

export default memo(UserPeopleTab)
