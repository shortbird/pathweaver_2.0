import React, { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { MagnifyingGlassIcon, UsersIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import {
  useAddGroupStudentCredits, useFamilyGroupStudents, useMyFamilyGroups, useSetStudentStanding,
} from '../hooks/api/useFamilyGroupDashboard'
import RosterImport from './sis/people/RosterImport'
import ModalOverlay from '../components/ui/ModalOverlay'
import GlassTabBar from '../components/ui/GlassTabBar'
import EmptyState from '../components/ui/EmptyState'
import { PageLoader } from '../components/ui/Spinner'
import CreditBankPanel, { CreditBalance, OPENED_CREDIT_TYPES } from '../components/sis/CreditBankPanel'

// A family group's own dashboard, for the person outside the school who runs
// the group: OpenEd's enrollment lead for the OpenEd families at Optio Academy
// (2026-10-13). She sent Tanner a weekly sheet of students to add and drop;
// this page is that sheet. Access is a grant on the group
// (routes/family_group_dashboard.py), so she sees these families and nothing
// else at the school.

const TABS = [
  { id: 'students', label: 'Students', icon: UsersIcon },
  { id: 'add', label: 'Add students', icon: UserPlusIcon },
]

// Least restrictive first: everyone, then narrow.
const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'enrolled', label: 'Enrolled' },
  { id: 'dropped', label: 'Dropped' },
]

const formatDate = (value) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** /family-groups: straight to the one group this person runs, or a list. */
export function FamilyGroupsIndexPage() {
  const { data, isLoading } = useMyFamilyGroups()
  if (isLoading) return <PageLoader className="py-24" />
  const groups = data || []
  if (groups.length === 1) return <Navigate to={`/family-groups/${groups[0].id}`} replace />
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Your families</h1>
      {groups.length === 0 ? (
        <EmptyState plain title="You do not manage any families yet." />
      ) : (
        <ul className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
          {groups.map(g => (
            <li key={g.id}>
              <a href={`/family-groups/${g.id}`} className="block px-4 py-3 hover:bg-gray-50">
                <span className="font-medium text-gray-900">{g.name}</span>
                <span className="text-sm text-gray-500"> at {g.school_name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function FamilyGroupDashboardPage() {
  const { groupId } = useParams()
  const [activeTab, setActiveTab] = useState('students')
  const { data, error, refetch } = useFamilyGroupStudents(groupId)
  const setStanding = useSetStudentStanding(groupId)
  const addCredits = useAddGroupStudentCredits(groupId)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [confirm, setConfirm] = useState(null) // { student, drop: bool }
  const [creditsFor, setCreditsFor] = useState(null) // student id

  const saving = setStanding.isPending
  const loadError = error && (error.response?.status === 404
    ? 'This page is not available to your account.'
    : 'Could not load the students. Refresh to try again.')

  const students = data?.students || []
  const counts = useMemo(() => ({
    all: students.length,
    enrolled: students.filter(s => s.status === 'enrolled').length,
    dropped: students.filter(s => s.status === 'dropped').length,
  }), [students])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (!q) return true
      return [s.name, s.email, ...s.parents.flatMap(p => [p.name, p.email])]
        .some(v => (v || '').toLowerCase().includes(q))
    })
  }, [students, search, statusFilter])

  const applyStanding = async () => {
    if (!confirm) return
    const { student, drop } = confirm
    try {
      await setStanding.mutateAsync({ studentId: student.id, drop })
      toast.success(drop ? `${student.name} was dropped` : `${student.name} is enrolled again`)
      setConfirm(null)
    } catch (err) {
      toast.error(err.response?.data?.error || 'That did not work. Try again.')
    }
  }

  if (loadError) {
    return <div className="max-w-3xl mx-auto px-4 py-16"><EmptyState plain title={loadError} /></div>
  }
  if (!data) return <PageLoader className="py-24" />

  const schoolName = data.group.school_name || 'Optio Academy'

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{data.group.name} students</h1>
        <p className="text-sm text-gray-600 mt-1">
          Add and drop {data.group.name} students at {schoolName}. Every family you add here is
          filed as {data.group.name}.
        </p>
      </div>

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
            ),
          }
        })}
        active={activeTab}
        onSelect={setActiveTab}
      />

      {activeTab === 'students' && (
        <div>
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <div className="flex gap-2" role="group" aria-label="Show">
              {STATUS_FILTERS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  aria-pressed={statusFilter === f.id}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                    statusFilter === f.id
                      ? 'bg-optio-purple text-white border-optio-purple'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {f.label} ({counts[f.id]})
                </button>
              ))}
            </div>
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search students or parents..."
                aria-label="Search students or parents"
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg w-72 max-w-full text-sm focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState
                plain
                title={students.length === 0
                  ? 'No students yet. Use Add students to paste your spreadsheet.'
                  : 'No students match.'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Parent</th>
                      <th className="px-4 py-3">Enrolled</th>
                      <th className="px-4 py-3">Last active</th>
                      <th className="px-4 py-3">Credits</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{s.name}</div>
                          <div className="text-gray-500 break-all">
                            {s.email || (s.managed_by_parent ? 'Signs in through their parent' : '')}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {s.parents.length === 0 ? <span className="text-gray-400">-</span> : s.parents.map(p => (
                            <div key={p.email || p.name}>
                              <div className="text-gray-900">{p.name}</div>
                              <div className="text-gray-500 break-all">{p.email}</div>
                            </div>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(s.enrolled_at)}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(s.last_active)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button type="button" onClick={() => setCreditsFor(s.id)}
                            className="hover:underline" aria-label={`Credits for ${s.name}`}>
                            <CreditBalance credits={s.credits} />
                          </button>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {s.status === 'enrolled' ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">Enrolled</span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              Dropped {s.dropped_at ? formatDate(s.dropped_at) : ''}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {s.status === 'enrolled' ? (
                            <button
                              type="button"
                              onClick={() => setConfirm({ student: s, drop: true })}
                              className="text-sm font-medium text-red-600 hover:text-red-700"
                            >
                              Drop
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirm({ student: s, drop: false })}
                              className="text-sm font-medium text-optio-purple hover:underline"
                            >
                              Re-enroll
                            </button>
                          )}
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

      {activeTab === 'add' && (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Paste rows from your weekly sheet: student first and last name, student email, parent
            first and last name, parent email. Extra columns are ignored. Each student joins their
            parent&apos;s family, and a student who was dropped comes back as enrolled.
          </p>
          <RosterImport
            orgName={schoolName}
            paths={{
              preview: `/api/family-groups/${groupId}/roster-import/preview`,
              commit: `/api/family-groups/${groupId}/roster-import/commit`,
            }}
            onImported={() => refetch()}
            sendEmailsDefault
            emailsOffHint="With this off, the new families get no login email until Optio sends it."
          />
        </div>
      )}

      {creditsFor && (() => {
        const student = students.find(s => s.id === creditsFor)
        if (!student) return null
        return (
          <ModalOverlay onClose={() => setCreditsFor(null)}>
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">{student.name}: credits</h2>
                <button type="button" onClick={() => setCreditsFor(null)}
                  className="text-sm text-gray-500 hover:text-gray-700">Close</button>
              </div>
              <CreditBankPanel
                credits={student.credits}
                orderLabel="OpenEd order number"
                types={OPENED_CREDIT_TYPES}
                onAdd={async (body) => {
                  await addCredits.mutateAsync({ studentId: student.id, body })
                  toast.success('Credits added')
                }}
              />
            </div>
          </ModalOverlay>
        )
      })()}

      {confirm && (
        <ModalOverlay onClose={() => !saving && setConfirm(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 mb-2">
              {confirm.drop ? `Drop ${confirm.student.name}?` : `Re-enroll ${confirm.student.name}?`}
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              {confirm.drop
                ? `${confirm.student.name} will be withdrawn from ${schoolName}. Their account and their work stay, so you can re-enroll them later.`
                : `${confirm.student.name} will be enrolled at ${schoolName} again.`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyStanding}
                disabled={saving}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-60 ${
                  confirm.drop ? 'bg-red-600 hover:bg-red-700' : 'bg-optio-purple hover:opacity-90'
                }`}
              >
                {saving ? 'Saving...' : confirm.drop ? 'Drop' : 'Re-enroll'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}
