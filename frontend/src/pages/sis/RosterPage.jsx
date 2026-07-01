import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import StudentDetailModal from './StudentDetailModal'
import SisMembershipPanel from '../../components/sis/people/SisMembershipPanel'
import { startMasquerade } from '../../services/masqueradeService'
import { switchSurfaceInApp } from '../../utils/appSurface'

const INACTIVE_STATUSES = ['withdrawn', 'graduated']

const fmtDate = (d) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '—' }
}

const RosterPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const orgSlug = orgs.find((o) => o.id === orgId)?.slug
  const navigate = useNavigate()
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)   // Manage modal (tabbed)
  const [menuFor, setMenuFor] = useState(null)      // open actions menu (student_id)
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

  // Keep the open Manage modal in sync with fresh roster data (e.g. after assigning
  // a student to a family, the modal reflects it without reopening).
  useEffect(() => {
    if (!selected) return
    const fresh = roster.find((r) => r.student_id === selected.student_id)
    if (fresh) setSelected(fresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster])

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

  // ── Administrative actions (dropdown = navigate-away; the rest live in Manage) ─
  const goOverview = (s) => navigate(`/admin/organizations/${orgId}/student/${s.student_id}`)

  const viewAsStudent = async (s) => {
    try {
      const res = await startMasquerade(s.student_id, 'SIS admin view', api)
      if (res?.success === false) { toast.error(res.error || 'Could not view as student'); return }
      // Switch to the learning app surface as the masqueraded student.
      switchSurfaceInApp('learning', '/dashboard')
    } catch {
      toast.error('Could not view as student')
    }
  }

  const actionsFor = (s) => [
    { label: 'Manage', onClick: () => setSelected(s) },
    { label: 'Overview', onClick: () => goOverview(s) },
    isSuperadmin && { label: 'View as student', onClick: () => viewAsStudent(s) },
  ].filter(Boolean)

  const toggleSort = (key) => setSort((prev) => (
    prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
  ))
  const sortArrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '')

  const visibleRoster = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = roster.filter((s) => {
      if (hideInactive && INACTIVE_STATUSES.includes(s.enrollment_status)) return false
      if (!q) return true
      return [s.name, s.email, s.username].some((v) => (v || '').toLowerCase().includes(q))
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    return rows.sort((a, b) => {
      let cmp
      if (sort.key === 'family') {
        cmp = (a.household_name || '').toLowerCase().localeCompare((b.household_name || '').toLowerCase())
      } else if (sort.key === 'last_active') {
        cmp = new Date(a.last_active || 0) - new Date(b.last_active || 0)
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
        <h1 className="text-2xl font-bold text-neutral-900">Users</h1>
        <div className="flex items-center gap-3">
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!roster.length}>Export CSV</Button>
        </div>
      </div>

      <SisMembershipPanel orgId={orgId} orgSlug={orgSlug} onChanged={load} />

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
        <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-left">
              <tr>
                <SortHeader label="Student" col="name" sort={sort} onSort={toggleSort} arrow={sortArrow} />
                <SortHeader label="Family" col="family" sort={sort} onSort={toggleSort} arrow={sortArrow} />
                <SortHeader label="Last active" col="last_active" sort={sort} onSort={toggleSort} arrow={sortArrow} />
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleRoster.map((s) => (
                <tr
                  key={s.student_id}
                  onClick={() => setSelected(s)}
                  className="hover:bg-neutral-50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{s.name}</div>
                    <div className="text-xs text-neutral-400">{s.email || s.username}</div>
                  </td>
                  <td className="px-4 py-3">
                    {s.household_name
                      ? <span className="text-neutral-600">{s.household_name}</span>
                      : <span className="text-neutral-300" title="Group this student into a family on the Families page">—</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{fmtDate(s.last_active)}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <RowActions
                      open={menuFor === s.student_id}
                      onOpen={() => setMenuFor(s.student_id)}
                      onClose={() => setMenuFor(null)}
                      actions={actionsFor(s)}
                    />
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

const RowActions = ({ open, onOpen, onClose, actions }) => (
  <div className="relative inline-block text-left">
    <button
      onClick={() => (open ? onClose() : onOpen())}
      className="px-2 py-1 rounded-md text-neutral-500 hover:bg-neutral-100 text-lg leading-none"
      aria-label="Actions"
    >
      ⋯
    </button>
    {open && (
      <>
        {/* click-away catcher */}
        <div className="fixed inset-0 z-10" onClick={onClose} />
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-left">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={() => { onClose(); a.onClick() }}
              className={`block w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 ${a.danger ? 'text-red-600' : 'text-neutral-700'}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </>
    )}
  </div>
)

export default RosterPage
