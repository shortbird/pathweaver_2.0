import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisRoster } from '../../hooks/api/useSisRoster'
import { sisPeopleApi } from '../../hooks/api/useSisPeople'
import { queryKeys } from '../../utils/queryKeys'
import Button from '../../components/ui/Button'
import { useSisOrg } from './useSisOrg'
import SisNewUserModal from '../../components/sis/SisNewUserModal'
import PeopleExportModal from '../../components/sis/PeopleExportModal'
import TeacherModal from '../../components/sis/TeacherModal'
import StaffDetailModal from '../../components/sis/StaffDetailModal'
import LinkStaffAccountModal from '../../components/sis/LinkStaffAccountModal'
import StaffProfileModal from '../../components/sis/StaffProfileModal'
import { startMasquerade } from '../../services/masqueradeService'
import { switchSurfaceInApp } from '../../utils/appSurface'
import { setPreviewTeacher } from './teacherPreview'
import PeopleFilterBar from './people/PeopleFilterBar'
import PeopleTable from './people/PeopleTable'
import { RemovePersonModal } from './people/RemovePersonModal'
import StaffDuplicatesBanner from './people/StaffDuplicatesBanner'
import {
  EMPTY_FILTERS, applyFilters, sortRows, isStaff, rolesOf, STAFF_ROLES,
} from './people/peopleFilters'
import PopMenu from '../../components/sis/ui/PopMenu'
import { useRecordDoors } from '../../components/sis/RecordDoors'

/**
 * People: one table of everyone in the school.
 *
 * It was three tabs (Everyone, Staff, Families) over three lists until
 * 2026-09-16, and the office kept switching between them for one question:
 * the Staff tab knew who had not accepted their invite, the Families tab knew
 * how a family pays, and the Everyone tab -- the one they scanned -- knew
 * neither. Now every row is a person showing every role they hold, the
 * filters are built from the list (see people/peopleFilters.js), and what a
 * tab used to know is a pill on the row or an option in a select.
 *
 * Families are still records: the family name on a row opens the family, and
 * "Not in a family" is a filter rather than a panel of its own.
 *
 * Filters live in the URL so a link can carry them: /people?role=student&
 * family=none is the old "Students without a family" panel.
 */

const FILTER_KEYS = ['q', 'role', 'status', 'family', 'pay']

const readFilters = (params) => {
  const f = { ...EMPTY_FILTERS }
  FILTER_KEYS.forEach((k) => { f[k] = params.get(k) || '' })
  f.recent = params.get('recent') === '1'
  f.showFormer = params.get('former') === '1'
  // The tabs' links, still honoured: /people?tab=staff and ?tab=families.
  if (params.get('tab') === 'staff' && !f.role) f.role = 'staff'
  if (params.get('tab') === 'families' && !f.family) f.family = 'in'
  return f
}

const writeFilters = (params, f) => {
  const next = new URLSearchParams(params)
  next.delete('tab')
  FILTER_KEYS.forEach((k) => { if (f[k]) next.set(k, f[k]); else next.delete(k) })
  if (f.recent) next.set('recent', '1'); else next.delete('recent')
  if (f.showFormer) next.set('former', '1'); else next.delete('former')
  return next
}

// StaffDetailModal and friends read the staff endpoint's row shape.
const asStaffRow = (r) => ({
  ...r,
  id: r.student_id,
  roles: rolesOf(r).filter((x) => STAFF_ROLES.includes(x)),
  created_at: r.joined_at,
})

const PeoplePage = () => {
  const { orgId, canViewAs } = useSisOrg()
  const { openStudent, openFamily } = useRecordDoors()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => readFilters(params), [params])
  const setFilters = (f) => setParams(writeFilters(params, f), { replace: true })

  const { data: roster = [], isLoading: loading, refetch } = useSisRoster(orgId)
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  const [menuFor, setMenuFor] = useState(null)
  const [staffFor, setStaffFor] = useState(null)        // Staff record
  const [editingStaff, setEditingStaff] = useState(null)
  const [linking, setLinking] = useState(null)
  const [employment, setEmployment] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [adding, setAdding] = useState(null)            // 'person' | 'teacher' | 'family' | null
  const [addMenu, setAddMenu] = useState(false)
  const [newFamily, setNewFamily] = useState('')
  const [showExport, setShowExport] = useState(false)
  const [resendingId, setResendingId] = useState(null)

  const refresh = () => {
    refetch()
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.households(orgId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.staff(orgId) })
  }

  // A link can open the new-family form (the dashboard's "Add a family"),
  // one family's record on a tab (?open=<household id>&tab=billing, the
  // deep link the dashboard and notifications use), or one person's record
  // (?student=<user id>, from the learning app's student page). The records
  // open through the console's one mount (M13a/b); this waits for the org,
  // which a superadmin's picker resolves a beat after the first render.
  useEffect(() => {
    if (!orgId) return
    const next = new URLSearchParams(params)
    let changed = false
    if (params.get('add') === 'family') {
      setAdding('family')
      next.delete('add')
      changed = true
    }
    if (params.get('open')) {
      openFamily(params.get('open'), {
        tab: params.get('tab') === 'billing' ? 'billing' : null, onSaved: refresh,
      })
      next.delete('open')
      if (params.get('tab') === 'billing') next.delete('tab')
      changed = true
    }
    if (params.get('student')) {
      openStudent(params.get('student'), { onSaved: refresh })
      next.delete('student')
      changed = true
    }
    if (changed) setParams(next, { replace: true })
  }, [orgId])

  const visible = useMemo(() => sortRows(applyFilters(roster, filters), sort), [roster, filters, sort])
  const hiddenCount = roster.length - visible.length
  const studentsWithoutFamily = useMemo(
    () => roster.filter((r) => r.is_student && !r.household_id && !['withdrawn', 'graduated'].includes(r.enrollment_status)).length,
    [roster],
  )

  const toggleSort = (key) => setSort((prev) => (
    prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
  ))

  // ── Row actions ──
  const goOverview = (s) => navigate(`/admin/organizations/${orgId}/student/${s.student_id}`)

  const viewAsStudent = async (s) => {
    try {
      const res = await startMasquerade(s.student_id, 'SIS admin view', api)
      if (res?.success === false) { toast.error(res.error || 'Could not view as student'); return }
      switchSurfaceInApp('learning', '/dashboard')
    } catch {
      toast.error('Could not view as student')
    }
  }

  const openPortalPreview = (s) => {
    setPreviewTeacher(asStaffRow(s))
    navigate('/')
    // Sidebar + layout read the preview at render time; a reload guarantees
    // every piece of chrome picks it up.
    window.location.reload()
  }

  const resendInvite = async (s) => {
    setResendingId(s.student_id)
    try {
      await sisPeopleApi.resendInvite(orgId, s.student_id)
      toast.success(`Setup email sent to ${s.email}`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not resend the invite')
    } finally {
      setResendingId(null)
    }
  }

  // Every account gets Manage; the rest depends on what the person is.
  const actionsFor = (s) => [
    { label: 'Manage', onClick: () => openStudent(s, { onSaved: refresh }) },
    s.is_student && { label: 'Overview', onClick: () => goOverview(s) },
    // The backend rule (caller_may_masquerade) has let an org admin open a
    // student of their own school since August; only this gate was narrower.
    s.is_student && canViewAs && { label: 'View as student', onClick: () => viewAsStudent(s) },
    isStaff(s) && { label: 'Staff record', onClick: () => setStaffFor(s) },
    isStaff(s) && !s.is_placeholder && { label: 'View their portal', onClick: () => openPortalPreview(s) },
    s.household_id && { label: 'Open family', onClick: () => openFamily(s.household_id, { onSaved: refresh }) },
    { label: 'Remove from school…', danger: true, onClick: () => setRemoving(s) },
  ].filter(Boolean)

  const createFamily = async () => {
    if (!newFamily.trim()) return
    try {
      await sisPeopleApi.createHousehold(orgId, newFamily.trim())
      setNewFamily('')
      setAdding(null)
      toast.success('Family created')
      refresh()
    } catch { toast.error('Could not create family') }
  }

  const staffRow = staffFor ? asStaffRow(staffFor) : null
  const placeholders = useMemo(() => roster.filter((r) => r.is_placeholder).map(asStaffRow), [roster])

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-neutral-900">People</h1>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowExport(true)} disabled={!visible.length}
            title="Exports the rows shown, with your filters and sort applied">Export CSV</Button>
          <PopMenu open={addMenu} onClose={() => setAddMenu(false)} width="w-44"
            trigger={(
              <Button size="sm" onClick={() => setAddMenu((v) => !v)} disabled={!orgId}
                aria-haspopup="menu" aria-expanded={addMenu}>+ Add</Button>
            )}
            items={[
              { label: 'Person', onClick: () => setAdding('person') },
              { label: 'Teacher', onClick: () => setAdding('teacher') },
              { label: 'Family', onClick: () => setAdding('family') },
            ]} />
        </div>
      </div>

      {adding === 'family' && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={newFamily}
            onChange={(e) => setNewFamily(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createFamily()}
            className="flex-1 min-w-[240px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
            placeholder="New family / household name"
            autoFocus
          />
          <Button size="sm" onClick={createFamily}>Create</Button>
          <Button size="sm" variant="outline" onClick={() => { setAdding(null); setNewFamily('') }}>Cancel</Button>
          <span className="text-xs text-neutral-400">Most families are created when they register.</span>
        </div>
      )}

      {!loading && roster.length > 0 && (
        <>
          <StaffDuplicatesBanner rows={roster} orgId={orgId} onMerged={refresh} />
          <PeopleFilterBar rows={roster} filters={filters} onChange={setFilters} />
          {studentsWithoutFamily > 0 && filters.family !== 'none' && (
            <p className="mb-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
              <span>
                {studentsWithoutFamily} student{studentsWithoutFamily === 1 ? ' is' : 's are'} not in a family yet,
                so they will not appear with their siblings on the Learning Plan pages.
              </span>
              <button type="button" onClick={() => setFilters({ ...EMPTY_FILTERS, role: 'student', family: 'none' })}
                className="font-medium underline hover:no-underline">Show them</button>
            </p>
          )}
        </>
      )}

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !roster.length && (
        <p className="text-neutral-500">No users found for this organization.</p>
      )}
      {!loading && roster.length > 0 && !visible.length && (
        <p className="text-neutral-500">Nobody matches your search or filters.</p>
      )}

      {!loading && visible.length > 0 && (
        <PeopleTable
          rows={visible}
          sort={sort}
          onSort={toggleSort}
          onOpen={(s) => openStudent(s, { onSaved: refresh })}
          onOpenFamily={(s) => openFamily(s.household_id, { onSaved: refresh })}
          onResendInvite={resendInvite}
          resendingId={resendingId}
          menuFor={menuFor}
          setMenuFor={setMenuFor}
          actionsFor={actionsFor}
        />
      )}

      {!loading && visible.length > 0 && (
        <p className="mt-3 text-xs text-neutral-400">
          Showing {visible.length} of {roster.length} {roster.length === 1 ? 'person' : 'people'}
          {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
        </p>
      )}

      {staffRow && (
        <StaffDetailModal
          orgId={orgId}
          staff={staffRow}
          onClose={() => setStaffFor(null)}
          onEdit={() => { setEditingStaff(staffRow); setStaffFor(null) }}
          onEmployment={() => { setEmployment(staffRow); setStaffFor(null) }}
          onLink={() => { setLinking(staffRow); setStaffFor(null) }}
          onViewPortal={() => openPortalPreview(staffFor)}
          onRemoved={() => { setStaffFor(null); refresh() }}
          onRolesChanged={() => { setStaffFor(null); refresh() }}
        />
      )}

      {(adding === 'teacher' || editingStaff) && (
        <TeacherModal
          orgId={orgId}
          initial={editingStaff}
          placeholders={placeholders}
          onClose={() => { setAdding(null); setEditingStaff(null) }}
          onSaved={() => { setAdding(null); setEditingStaff(null); refresh() }}
        />
      )}

      {linking && (
        <LinkStaffAccountModal orgId={orgId} staff={linking}
          onClose={() => setLinking(null)} onLinked={() => { setLinking(null); refresh() }} />
      )}

      {employment && (
        <StaffProfileModal orgId={orgId} staff={employment}
          onClose={() => setEmployment(null)} onSaved={() => { setEmployment(null); refresh() }} />
      )}

      {adding === 'person' && (
        <SisNewUserModal orgId={orgId} onClose={() => setAdding(null)} onCreated={refresh} />
      )}

      {showExport && (
        <PeopleExportModal rows={visible} orgId={orgId} studentsOnly={filters.role === 'student'}
          onClose={() => setShowExport(false)} />
      )}

      {removing && (
        <RemovePersonModal person={removing} orgId={orgId}
          onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); refresh() }} />
      )}
    </div>
  )
}

export default PeoplePage
