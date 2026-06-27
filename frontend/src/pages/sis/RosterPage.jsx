import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import StudentDetailModal from './StudentDetailModal'

const STATUSES = ['applicant', 'enrolled', 'withdrawn', 'graduated', 'unassigned']
// Logical sort rank for the status column (active students first, exited last).
const STATUS_RANK = { enrolled: 0, applicant: 1, unassigned: 2, withdrawn: 3, graduated: 4 }
const INACTIVE_STATUSES = ['withdrawn', 'graduated']

const statusStyle = (s) => ({
  enrolled: 'bg-green-100 text-green-700',
  applicant: 'bg-yellow-100 text-yellow-700',
  withdrawn: 'bg-red-100 text-red-700',
  graduated: 'bg-blue-100 text-blue-700',
  unassigned: 'bg-gray-100 text-gray-600',
}[s] || 'bg-gray-100 text-gray-600')

const RosterPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [hideInactive, setHideInactive] = useState(true)
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg('/api/sis/roster', orgId))
      .then((r) => setRoster(r.data?.roster || []))
      .catch(() => toast.error('Failed to load roster'))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const updateStatus = async (studentId, status) => {
    try {
      await api.patch(`/api/sis/enrollments/${studentId}`, {
        status: status === 'unassigned' ? 'enrolled' : status,
        organization_id: orgId,
      })
      toast.success('Enrollment updated')
      load()
    } catch {
      toast.error('Could not update enrollment')
    }
  }

  const exportCsv = async () => {
    try {
      const res = await api.get(withOrg('/api/sis/reports/roster.csv', orgId), { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'roster.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Export failed')
    }
  }

  const toggleSort = (key) => setSort((prev) => (
    prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
  ))

  const sortArrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '')

  const visibleRoster = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = roster.filter((s) => {
      if (hideInactive && INACTIVE_STATUSES.includes(s.enrollment_status)) return false
      if (!q) return true
      return [s.name, s.email, s.username]
        .some((v) => (v || '').toLowerCase().includes(q))
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    return rows.sort((a, b) => {
      let cmp
      if (sort.key === 'status') {
        cmp = (STATUS_RANK[a.enrollment_status] ?? 9) - (STATUS_RANK[b.enrollment_status] ?? 9)
      } else if (sort.key === 'xp') {
        cmp = (a.total_xp ?? 0) - (b.total_xp ?? 0)
      } else if (sort.key === 'family') {
        cmp = (a.household_name || '').toLowerCase().localeCompare((b.household_name || '').toLowerCase())
      } else {
        cmp = (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())
      }
      if (cmp === 0) cmp = (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())
      return cmp * dir
    })
  }, [roster, search, hideInactive, sort])

  const hiddenCount = roster.length - visibleRoster.length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Roster</h1>
        <div className="flex items-center gap-3">
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!roster.length}>
            Export CSV
          </Button>
        </div>
      </div>

      {!loading && roster.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or username…"
            className="flex-1 min-w-[220px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
          <label className="flex items-center gap-2 text-sm text-neutral-600 select-none">
            <input
              type="checkbox"
              checked={hideInactive}
              onChange={(e) => setHideInactive(e.target.checked)}
              className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
            />
            Hide withdrawn &amp; graduated
          </label>
        </div>
      )}

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !roster.length && (
        <p className="text-neutral-500">No students found for this organization.</p>
      )}
      {!loading && roster.length > 0 && !visibleRoster.length && (
        <p className="text-neutral-500">No students match your search or filters.</p>
      )}

      {!loading && visibleRoster.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-left">
              <tr>
                <SortHeader label="Student" col="name" sort={sort} onSort={toggleSort} arrow={sortArrow} />
                <SortHeader label="Family" col="family" sort={sort} onSort={toggleSort} arrow={sortArrow} />
                <SortHeader label="Status" col="status" sort={sort} onSort={toggleSort} arrow={sortArrow} />
                <SortHeader label="XP" col="xp" sort={sort} onSort={toggleSort} arrow={sortArrow} />
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleRoster.map((s) => (
                <tr key={s.student_id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{s.name}</div>
                    <div className="text-xs text-neutral-400">{s.email || s.username}</div>
                  </td>
                  <td className="px-4 py-3">
                    {s.household_name
                      ? <span className="text-neutral-600">{s.household_name}</span>
                      : <span className="text-neutral-300" title="Group this student into a family on the Families page">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={s.enrollment_status}
                      onChange={(e) => updateStatus(s.student_id, e.target.value)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium border-0 focus:ring-2 focus:ring-optio-purple ${statusStyle(s.enrollment_status)}`}
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{s.total_xp ?? 0}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelected(s)}
                      className="text-optio-purple font-medium hover:underline"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && visibleRoster.length > 0 && (
        <p className="mt-3 text-xs text-neutral-400">
          Showing {visibleRoster.length} of {roster.length} student{roster.length === 1 ? '' : 's'}
          {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
        </p>
      )}

      {selected && (
        <StudentDetailModal
          student={selected}
          orgId={orgId}
          onClose={() => setSelected(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

const SortHeader = ({ label, col, sort, onSort, arrow }) => (
  <th className="px-4 py-3 font-medium">
    <button
      onClick={() => onSort(col)}
      className={`inline-flex items-center hover:text-neutral-800 ${sort.key === col ? 'text-neutral-800' : ''}`}
    >
      {label}{arrow(col)}
    </button>
  </th>
)

export default RosterPage
