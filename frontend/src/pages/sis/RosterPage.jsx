import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import StudentDetailModal from './StudentDetailModal'
import SisNewUserModal from '../../components/sis/SisNewUserModal'
import PersonPhoto from '../../components/sis/PersonPhoto'
import { RolePill } from '../../components/ui/RolePill'
import { startMasquerade } from '../../services/masqueradeService'
import { switchSurfaceInApp } from '../../utils/appSurface'

const INACTIVE_STATUSES = ['withdrawn', 'graduated']
const ROLE_ORDER = { org_admin: 0, advisor: 1, parent: 2, student: 3, observer: 4 }

const fmtDate = (d) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '—' }
}

const RosterPage = ({ embedded = false, toolbarEl = null }) => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const navigate = useNavigate()
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)   // Manage modal (tabbed)
  const [showNewUser, setShowNewUser] = useState(false)  // + New User modal
  const [menuFor, setMenuFor] = useState(null)      // open actions menu (student_id)
  const [removing, setRemoving] = useState(null)    // person being removed from the org
  const [search, setSearch] = useState('')
  const [hideInactive, setHideInactive] = useState(true)
  const [studentsOnly, setStudentsOnly] = useState(false)
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

  // Export exactly what the table is showing — same filters, same search, same
  // sort — and include Age, which is the column schools that don't track grade
  // levels actually filter on. The old export hit a server endpoint that dumped
  // the whole org: filtering to students still exported parents, and Grade Level
  // came back empty for anyone without a school_enrollments row.
  const exportCsv = () => {
    const rows = visibleRoster
    if (!rows.length) { toast.error('Nothing to export'); return }
    const header = ['Name', 'First Name', 'Last Name', 'Age', 'Date of Birth', 'Role',
                    'Email', 'Phone', 'Username', 'Enrollment Status', 'Grade Level', 'Family',
                    'Total XP', 'Last Active']
    const cell = (v) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const body = rows.map((s) => [
      s.name, s.first_name, s.last_name, s.age, s.date_of_birth,
      (s.roles?.length ? s.roles : [s.role]).filter(Boolean).join(' / '),
      s.email, s.phone_number, s.username, s.enrollment_status, s.grade_level, s.household_name,
      s.total_xp ?? 0, s.last_active,
    ].map(cell).join(','))
    const csv = [header.join(','), ...body].join('\r\n')
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `people${studentsOnly ? '-students' : ''}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} ${rows.length === 1 ? 'person' : 'people'}`)
  }

  // ── Administrative actions (dropdown = navigate-away; the rest live in Manage) ─
  const goOverview = (s) => navigate(`/admin/organizations/${orgId}/student/${s.student_id}`)

  const viewAsStudent = async (s) => {
    try {
      const res = await startMasquerade(s.student_id, 'SIS admin view', api)
      if (res?.success === false) { toast.error(res.error || 'Could not view as student'); return }
      // Switch to the web platform surface as the masqueraded student.
      switchSurfaceInApp('learning', '/dashboard')
    } catch {
      toast.error('Could not view as student')
    }
  }

  // Every account gets Manage (profile, roles, message); the student-specific
  // actions stay student-only. Teachers/parents previously had NO menu at all,
  // which made their roles uneditable from this page.
  const actionsFor = (s) => [
    { label: 'Manage', onClick: () => setSelected(s) },
    s.is_student && { label: 'Overview', onClick: () => goOverview(s) },
    s.is_student && isSuperadmin && { label: 'View as student', onClick: () => viewAsStudent(s) },
    { label: 'Remove from school…', danger: true, onClick: () => setRemoving(s) },
  ].filter(Boolean)

  const toggleSort = (key) => setSort((prev) => (
    prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
  ))
  const sortArrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '')

  const visibleRoster = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = roster.filter((s) => {
      if (studentsOnly && !s.is_student) return false
      if (hideInactive && s.is_student && INACTIVE_STATUSES.includes(s.enrollment_status)) return false
      if (!q) return true
      return [s.name, s.email, s.username, s.role].some((v) => (v || '').toLowerCase().includes(q))
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    return rows.sort((a, b) => {
      let cmp
      if (sort.key === 'family') {
        cmp = (a.household_name || '').toLowerCase().localeCompare((b.household_name || '').toLowerCase())
      } else if (sort.key === 'last') {
        cmp = (a.last_name || '').toLowerCase().localeCompare((b.last_name || '').toLowerCase())
      } else if (sort.key === 'age') {
        // Students without a DOB sort last regardless of direction.
        const av = a.age == null ? Infinity : a.age
        const bv = b.age == null ? Infinity : b.age
        cmp = av - bv
      } else if (sort.key === 'last_active') {
        cmp = new Date(a.last_active || 0) - new Date(b.last_active || 0)
      } else if (sort.key === 'role') {
        cmp = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
      } else {
        cmp = (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())
      }
      if (cmp === 0) cmp = (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())
      return cmp * dir
    })
  }, [roster, search, hideInactive, studentsOnly, sort])

  const hiddenCount = roster.length - visibleRoster.length

  return (
    <div>
      {embedded ? (
        // In the People tab shell: buttons live on the tab row (via the toolbar slot).
        toolbarEl && createPortal(
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!visibleRoster.length}
              title="Exports the rows shown, with your filters and sort applied">Export CSV</Button>
            <Button size="sm" onClick={() => setShowNewUser(true)} disabled={!orgId}>+ New User</Button>
          </>,
          toolbarEl,
        )
      ) : (
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">Users</h1>
          <div className="flex items-center gap-3">
            <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!visibleRoster.length}
              title="Exports the rows shown, with your filters and sort applied">Export CSV</Button>
            <Button size="sm" onClick={() => setShowNewUser(true)} disabled={!orgId}>+ New User</Button>
          </div>
        </div>
      )}

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
          <label className="flex items-center gap-2 text-sm text-neutral-600 select-none">
            <input
              type="checkbox"
              checked={studentsOnly}
              onChange={(e) => setStudentsOnly(e.target.checked)}
              className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
            />
            Students only
          </label>
        </div>
      )}

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !roster.length && (
        <p className="text-neutral-500">No users found for this organization.</p>
      )}
      {!loading && roster.length > 0 && !visibleRoster.length && (
        <p className="text-neutral-500">No users match your search or filters.</p>
      )}

      {!loading && visibleRoster.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <button onClick={() => toggleSort('name')}
                    className={`inline-flex items-center hover:text-neutral-800 ${sort.key === 'name' ? 'text-neutral-800' : ''}`}>
                    Name{sortArrow('name')}
                  </button>
                  <button onClick={() => toggleSort('last')}
                    className={`ml-3 inline-flex items-center text-xs hover:text-neutral-800 ${sort.key === 'last' ? 'text-neutral-800' : 'text-neutral-400'}`}>
                    Last name{sortArrow('last')}
                  </button>
                </th>
                <SortHeader label="Age" col="age" sort={sort} onSort={toggleSort} arrow={sortArrow} />
                <SortHeader label="Role" col="role" sort={sort} onSort={toggleSort} arrow={sortArrow} />
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
                    <div className="flex items-center gap-3">
                      <PersonPhoto src={s.avatar_url} name={s.name} />
                      <div className="min-w-0">
                        <div className="font-medium text-neutral-900">{s.name}</div>
                        <div className="text-xs text-neutral-400 truncate">
                          {[s.email || s.username, s.phone_number].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{s.age != null ? s.age : <span className="text-neutral-300">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      {(s.roles?.length ? s.roles : [s.role]).filter(Boolean).map((r) => <RolePill key={r} role={r} />)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {s.household_name
                      ? <span className="text-neutral-600">{s.household_name}</span>
                      : <span className="text-neutral-300" title={s.is_student ? 'Group this student into a family on the Families page' : undefined}>—</span>}
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
          Showing {visibleRoster.length} of {roster.length} user{roster.length === 1 ? '' : 's'}
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

      {showNewUser && (
        <SisNewUserModal
          orgId={orgId}
          onClose={() => setShowNewUser(false)}
          onCreated={load}
        />
      )}

      {removing && (
        <RemovePersonModal
          person={removing}
          orgId={orgId}
          onClose={() => setRemoving(null)}
          onDone={() => { setRemoving(null); load() }}
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

const HISTORY_LABELS = {
  class_enrollments: 'active class',
  attendance: 'attendance record',
  completed_work: 'completed task',
  registrations: 'registration',
  forms: 'submitted form',
  dependents: 'linked student',
  classes: 'class taught',
  time_entries: 'time entry',
  onboarding: 'onboarding task',
}

const historyLine = (history = {}) => Object.entries(history)
  .filter(([, n]) => n > 0)
  .map(([k, n]) => `${n} ${HISTORY_LABELS[k] || k.replace(/_/g, ' ')}${n === 1 ? '' : 's'}`)
  .join(' · ')

/**
 * Removing a person from the school. Two outcomes, and which one is available
 * depends on what they're attached to: an account with records is archived
 * (hidden, history intact), a clean duplicate can be deleted outright. Deleting
 * a family never removed the accounts inside it — that left iCreate with three
 * ghost Swensons and no way to clear them.
 */
const RemovePersonModal = ({ person, orgId, onClose, onDone }) => {
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    api.get(`/api/sis/people/${person.student_id}/removal-preview?organization_id=${orgId}`)
      .then((r) => setPreview(r.data))
      .catch((e) => { setFailed(true); toast.error(e?.response?.data?.error || 'Could not check this account') })
  }, [person.student_id, orgId])

  const run = async (mode) => {
    setBusy(true)
    try {
      const { data } = await api.delete(`/api/sis/people/${person.student_id}?organization_id=${orgId}&mode=${mode}`)
      toast.success(data?.deleted
        ? `${person.name} deleted`
        : `${person.name} removed from the school${data?.seats_released ? ` · ${data.seats_released} class seat(s) freed` : ''}`)
      onDone()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not remove this person')
    } finally { setBusy(false) }
  }

  const attached = preview ? historyLine(preview.history) : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-neutral-900">Remove {person.name}?</h2>

        {!preview && !failed && <p className="mt-3 text-sm text-neutral-500">Checking what they're attached to…</p>}
        {failed && <p className="mt-3 text-sm text-neutral-500">Couldn't load this account's records.</p>}

        {preview && (
          <>
            <p className="mt-3 text-sm text-neutral-600">
              {attached
                ? <>They have {attached} on file.</>
                : <>They have no school records — nothing would be orphaned.</>}
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="font-medium text-neutral-800">Archive</p>
                <p className="text-neutral-500 mt-0.5">
                  {preview.kind === 'student'
                    ? 'Marks them withdrawn and frees their class seats. Their history stays.'
                    : 'Removes them from this school. The account itself is kept.'}
                </p>
                <button onClick={() => run('archive')} disabled={busy}
                  className="mt-2 px-3 py-1.5 rounded-lg border border-gray-300 text-neutral-700 hover:bg-gray-50 disabled:opacity-50">
                  Archive
                </button>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="font-medium text-neutral-800">Delete permanently</p>
                <p className="text-neutral-500 mt-0.5">
                  {preview.can_delete
                    ? 'For duplicates and typos — the account is gone for good.'
                    : 'Not available: deleting would orphan the records above.'}
                </p>
                <button onClick={() => run('delete')} disabled={busy || !preview.can_delete}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40">
                  Delete
                </button>
              </div>
            </div>
          </>
        )}

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

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
