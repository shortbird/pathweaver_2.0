import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import EnrollStudentForm from '../components/partner/EnrollStudentForm'
import ModalOverlay from '../components/ui/ModalOverlay'
import { MagnifyingGlassIcon, UsersIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import GlassTabBar from '../components/ui/GlassTabBar'
import EmptyState from '../components/ui/EmptyState'
import { PageLoader } from '../components/ui/Spinner'

const TABS = [
  { id: 'enrollments', label: 'Active Enrollments', icon: UsersIcon },
  { id: 'register', label: 'Register a Student', icon: UserPlusIcon }
]

const formatDate = (value) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * OnFireDashboard
 *
 * Simplified two-tab landing page for the OnFire Learning org_admin:
 *   - Active Enrollments: every student in the org and the course they're in
 *   - Register a Student: the enrollment form
 */
export default function OnFireDashboard() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const orgId = searchParams.get('org') || user?.organization_id

  const [activeTab, setActiveTab] = useState('enrollments')
  const [enrollments, setEnrollments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [removeTarget, setRemoveTarget] = useState(null)
  const [removing, setRemoving] = useState(false)

  const fetchEnrollments = useCallback(async () => {
    if (!orgId) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const res = await api.get(`/api/admin/organizations/${orgId}/course-enrollments`)
      setEnrollments(res.data.enrollments || [])
    } catch (err) {
      toast.error('Failed to load enrollments')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchEnrollments()
  }, [fetchEnrollments])

  const removeAccess = async () => {
    if (!removeTarget || !orgId) return
    setRemoving(true)
    try {
      await api.post(`/api/admin/organizations/${orgId}/course-enrollments/remove`, {
        student_id: removeTarget.student_id,
        course_id: removeTarget.course_id
      })
      setEnrollments(prev => prev.filter(e => e.enrollment_id !== removeTarget.enrollment_id))
      toast.success('Access removed')
      setRemoveTarget(null)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove access')
    } finally {
      setRemoving(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return enrollments
    return enrollments.filter(e =>
      (e.student_name || '').toLowerCase().includes(q) ||
      (e.student_email || '').toLowerCase().includes(q) ||
      (e.course_title || '').toLowerCase().includes(q)
    )
  }, [enrollments, search])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">OnFire Learning</h1>
        <p className="text-sm text-gray-600 mt-1">Manage your students' Optio course enrollments.</p>
      </div>

      {/* Tabs */}
      <GlassTabBar
        size="md"
        className="mb-6"
        aria-label="Dashboard sections"
        tabs={TABS.map(tab => {
          const Icon = tab.icon
          return {
            id: tab.id,
            label: (
              <span className="inline-flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {tab.label}
              </span>
            )
          }
        })}
        active={activeTab}
        onSelect={setActiveTab}
      />

      {activeTab === 'enrollments' && (
        <div>
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <p className="text-sm text-gray-600">
              {loading ? 'Loading...' : `${filtered.length} active enrollment${filtered.length === 1 ? '' : 's'}`}
            </p>
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search students or courses..."
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg w-72 text-sm focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {loading ? (
              <PageLoader className="py-12" />
            ) : filtered.length === 0 ? (
              <EmptyState
                plain
                title={enrollments.length === 0 ? 'No active enrollments yet. Register a student to get started.' : 'No matches for your search.'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Course</th>
                      <th className="px-4 py-3">Date Enrolled</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(e => (
                      <tr key={e.enrollment_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{e.student_name}</td>
                        <td className="px-4 py-3 text-gray-600 break-all">{e.student_email}</td>
                        <td className="px-4 py-3 text-gray-900">{e.course_title}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(e.enrolled_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setRemoveTarget(e)}
                            className="text-sm font-medium text-red-600 hover:text-red-700 whitespace-nowrap"
                          >
                            Remove access
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'register' && (
        <div className="max-w-2xl">
          <EnrollStudentForm orgId={orgId} onRegistered={fetchEnrollments} />
        </div>
      )}

      {/* Remove access confirmation */}
      {removeTarget && (
        <ModalOverlay onClose={() => !removing && setRemoveTarget(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Remove access?</h2>
            <p className="text-sm text-gray-600 mb-5">
              This removes <strong>{removeTarget.student_name}</strong>'s access to{' '}
              <strong>{removeTarget.course_title}</strong> and deletes their progress in it.
              This can't be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRemoveTarget(null)}
                disabled={removing}
                className="btn-quiet flex-1"
              >
                Cancel
              </button>
              <button
                onClick={removeAccess}
                disabled={removing}
                className="btn-danger flex-1"
              >
                {removing ? 'Removing...' : 'Remove access'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}
