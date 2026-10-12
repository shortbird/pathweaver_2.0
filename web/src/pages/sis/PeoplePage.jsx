import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisRoster } from '../../hooks/api/useSisRoster'
import { sisPeopleApi } from '../../hooks/api/useSisPeople'
import { queryKeys } from '../../utils/queryKeys'
import Button from '../../components/ui/Button'
import { useSisOrg } from './useSisOrg'
import PeopleExportModal from '../../components/sis/PeopleExportModal'
import InviteSecondParentsModal from '../../components/sis/InviteSecondParentsModal'
import { startMasquerade } from '../../services/masqueradeService'
import { learningSurfaceHref } from '../../utils/appSurface'
import { setPreviewTeacher } from './teacherPreview'
import PeopleFilterBar from './people/PeopleFilterBar'
import PeopleTable from './people/PeopleTable'
import { RemovePersonModal } from './people/RemovePersonModal'
import PersonActionsModal from './people/PersonActionsModal'
import AddPeopleWizard from './people/AddPeopleWizard'
import StaffDuplicatesBanner from './people/StaffDuplicatesBanner'
import {
  EMPTY_FILTERS, applyFilters, sortRows, isStaff, asStaffRow,
  QUICK_VIEWS, quickViewOf, applyQuickView, withTodaysAge,
} from './people/peopleFilters'
import GlassTabBar from '../../components/ui/GlassTabBar'
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
 *
 * The quick views at the top (Everyone, Staff, Families, Students) are the
 * old tabs' one click back, set on the same filters: /people?role=staff is
 * the Staff view (ticket 180cc397, 2026-09-22).
 */

const FILTER_KEYS = ['q', 'role', 'status', 'family', 'pay']

export const SEARCH_URL_DEBOUNCE_MS = 250

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

const PeoplePage = () => {
  const { orgId, canViewAs, isAdmin, activeOrg } = useSisOrg()
  const { openStudent, openFamily, openStaff } = useRecordDoors()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const urlFilters = useMemo(() => readFilters(params), [params])

  // The search box is local state; the URL follows it on a short debounce.
  //
  // Ticket a8049dcb (iCreate coordinator): "When I type in a search ... it
  // takes several seconds for each character to pop up. If you type at a
  // normal speed it doesn't catch all of the characters." The input was driven
  // by the URL, and the Router runs every navigation as a React transition
  // (v7_startTransition), so each keystroke was a low-priority update the
  // controlled input waited on -- and a keystroke that landed before the last
  // one committed was built from the stale value and lost. On top of that the
  // whole roster was refiltered (several passes, for the counts) per key.
  //
  // Now the box answers at once, the URL is written 250ms after typing stops
  // (so a link and Back still carry the search), and the table and counts
  // filter on a deferred copy so typing never waits for them.
  const [query, setQuery] = useState(urlFilters.q)
  // The q this page last wrote to (or read from) the URL. A URL q that
  // differs from it came from outside -- Back, a link, a quick view -- and
  // replaces the box; our own debounced write does not echo back into it.
  const syncedQ = useRef(urlFilters.q)
  useEffect(() => {
    if (urlFilters.q === syncedQ.current) return
    syncedQ.current = urlFilters.q
    setQuery(urlFilters.q)
  }, [urlFilters.q])
  useEffect(() => {
    if (query === syncedQ.current) return undefined
    const t = setTimeout(() => {
      syncedQ.current = query
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (query) next.set('q', query); else next.delete('q')
        return next
      }, { replace: true })
    }, SEARCH_URL_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const filters = useMemo(() => ({ ...urlFilters, q: query }), [urlFilters, query])
  // What the table and the filter counts read: lags the box under load.
  const listFilters = useDeferredValue(filters)
  const setFilters = (f) => {
    syncedQ.current = f.q
    setQuery(f.q)
    setParams((prev) => writeFilters(prev, f), { replace: true })
  }

  const { data: roster = [], isLoading: loading, refetch } = useSisRoster(orgId)
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  // The person whose actions are open. The row used to go straight to Manage
  // and everything else hid behind a per-row menu; now the row asks what you
  // want and Manage is the first answer (2026-09-22).
  const [acting, setActing] = useState(null)
  const [removing, setRemoving] = useState(null)
  // The add wizard: false closed, true at its first question, or the job it
  // opens straight onto ('family' from the dashboard's "Add a family").
  const [adding, setAdding] = useState(false)
  const [showExport, setShowExport] = useState(false)
  // Ticket d11e5168: second parents who are only an emergency contact.
  const [showSecondParents, setShowSecondParents] = useState(false)
  const [resendingId, setResendingId] = useState(null)

  const refresh = () => {
    refetch()
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.households(orgId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.staff(orgId) })
  }

  // A link can open the add wizard on its family form (the dashboard's "Add a family"),
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

  const people = useMemo(() => withTodaysAge(roster), [roster])
  const visible = useMemo(() => sortRows(applyFilters(people, listFilters), sort), [people, listFilters, sort])
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
      // One navigation, straight to the learning app. startMasquerade pauses
      // this page's queries before it leaves, so the roster never refetches
      // as the student (07b05221).
      const res = await startMasquerade(s.student_id, 'SIS admin view', api, () => learningSurfaceHref('/dashboard'))
      if (res?.success === false) { toast.error(res.error || 'Could not view as student') }
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
    isStaff(s) && { label: 'Staff record', onClick: () => openStaff(s, {
      onSaved: refresh, onViewPortal: () => openPortalPreview(s) }) },
    isStaff(s) && !s.is_placeholder && { label: 'View their portal', onClick: () => openPortalPreview(s) },
    s.household_id && { label: 'Open family', onClick: () => openFamily(s.household_id, { onSaved: refresh }) },
    { label: 'Remove from school…', danger: true, onClick: () => setRemoving(s) },
  ].filter(Boolean)

  const placeholders = useMemo(() => roster.filter((r) => r.is_placeholder).map(asStaffRow), [roster])

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-neutral-900">People</h1>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setShowSecondParents(true)} disabled={!orgId}
              title="Parents listed only as an emergency contact, with no account">Invite second parents</Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowExport(true)} disabled={!visible.length}
            title="Exports the rows shown, with your filters and sort applied">Export CSV</Button>
          <Button size="sm" onClick={() => setAdding(true)} disabled={!orgId}
            aria-haspopup="dialog">+ Add</Button>
        </div>
      </div>

      {!loading && roster.length > 0 && (
        <>
          {/* One click to the staff, so staff still feel like their own
              page without a second list (ticket 180cc397). The views set the
              role and family filters below; they are not a filter of their own. */}
          <GlassTabBar align="start" aria-label="People views" className="mb-4"
            tabs={QUICK_VIEWS.map(({ id, label }) => ({ id, label }))}
            active={quickViewOf(filters)}
            onSelect={(id) => setFilters(applyQuickView(filters, id))} />
          <StaffDuplicatesBanner rows={roster} orgId={orgId} onMerged={refresh} />
          <PeopleFilterBar rows={roster} filters={listFilters} onChange={setFilters}
            query={query} onQueryChange={setQuery} />
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
          onOpen={setActing}
          onOpenFamily={(s) => openFamily(s.household_id, { onSaved: refresh })}
          onResendInvite={resendInvite}
          resendingId={resendingId}
        />
      )}

      {!loading && visible.length > 0 && (
        <p className="mt-3 text-xs text-neutral-400">
          Showing {visible.length} of {roster.length} {roster.length === 1 ? 'person' : 'people'}
          {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
        </p>
      )}

      {adding && (
        <AddPeopleWizard
          orgId={orgId}
          orgName={activeOrg?.name}
          placeholders={placeholders}
          initialPath={adding === true ? null : adding}
          onClose={() => setAdding(false)}
          onChanged={refresh}
          onOpenFamily={(id) => openFamily(id, { onSaved: refresh })}
        />
      )}

      {showExport && (
        <PeopleExportModal rows={visible} orgId={orgId} studentsOnly={filters.role === 'student'}
          onClose={() => setShowExport(false)} />
      )}

      {showSecondParents && (
        <InviteSecondParentsModal orgId={orgId} onClose={() => setShowSecondParents(false)}
          onDone={refresh} />
      )}

      {acting && (
        <PersonActionsModal person={acting} actions={actionsFor(acting)}
          onClose={() => setActing(null)} />
      )}
      {removing && (
        <RemovePersonModal person={removing} orgId={orgId}
          onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); refresh() }} />
      )}
    </div>
  )
}

export default PeoplePage
