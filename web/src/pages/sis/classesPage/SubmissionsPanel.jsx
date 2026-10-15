import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import { useSisOrg, withOrg } from '../useSisOrg'
import { isPathHidden } from '../sisModules'
import SearchSelect from '../../../components/ui/SearchSelect'
import { classLabel } from '../../../components/sis/classLabel'
import ReviewQueueTable, { QueueHeader } from '../../../components/credit-dashboard/ReviewQueueTable'
import FloatingActionBar from '../../../components/credit-dashboard/FloatingActionBar'
import ShortcutHelp from '../../../components/credit-dashboard/ShortcutHelp'
import useKeyboardShortcuts from '../../../hooks/useKeyboardShortcuts'
import SubmissionGrader, { REVIEW_LABEL, timeAgo } from './SubmissionGrader'

// The evidence picture and its device-only rule moved into the credit
// grader's shared evidence card (ticket d0cc8d45); re-exported here for the
// callers and tests that found them on this panel.
export { EvidenceImage, isDeviceOnlyUrl } from '../../../components/credit-dashboard/EvidenceImage'

/**
 * Submissions inbox — one unified queue of everything newly submitted by
 * students in the teacher's classes, reviewed the way credit is reviewed
 * (Tanner, 2026-10-15): the queue as a table with bulk select and a bulk
 * Accept, and a row opening the full-screen grader with the student's work,
 * the feedback thread, the XP, and Accept or Grow This. Deciding moves on to
 * the next submission. j/k move, a/g decide, Esc goes back to the queue.
 *
 * It shares the credit dashboard's components (ReviewQueueTable, GraderFrame,
 * GraderEvidence, EvidenceBlockCard, the bulk bar, ShortcutHelp) and none of
 * its endpoints: a review here is a sis_submission_reviews row written through
 * /api/sis/submissions, never a credit decision.
 */

// One page of the queue. The server's default is 50 too; sending it keeps
// offset arithmetic for Load more on the client's side of the contract.
const PAGE_SIZE = 50

const SHORTCUTS = [
  { key: 'j', description: 'Next submission (opens the grader from the queue)' },
  { key: 'k', description: 'Previous submission' },
  { key: 'a', description: 'Accept, with the note as written' },
  { key: 'g', description: 'Grow This (send back with the note; focuses the note if empty)' },
  { key: 'Esc', description: 'Back to the queue / close dialog' },
  { key: '?', description: 'Toggle this help overlay' },
]

const listParams = (scope, classId, search, offset) => {
  const p = new URLSearchParams({ scope, limit: String(PAGE_SIZE), offset: String(offset) })
  if (classId) p.set('class_id', classId)
  if (search) p.set('q', search)
  return p.toString()
}

const StatusChip = ({ review }) => {
  if (!review) {
    return <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">New</span>
  }
  const sentBack = review.action === 'grow_this'
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
      sentBack ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
      {REVIEW_LABEL[review.action] || 'Reviewed'}
    </span>
  )
}

export default function SubmissionsPanel() {
  const { orgId, activeOrg } = useSisOrg()
  // A school with classes off (one child at a time) has no class to filter
  // by, and the class list would be a request to a module that is off.
  const classesOn = !isPathHidden('/classes', activeOrg)
  const [searchParams] = useSearchParams()
  const [scope, setScope] = useState('new')
  // Pre-filtered when arrived at from a class's Student Progress tab, which is
  // where a teacher is when they wonder what a student has handed in (Gryffin,
  // 2026-08-27: "a submissions tab should be under student progress. It is hard
  // to figure out where to find that").
  const [classId, setClassId] = useState(searchParams.get('class_id') || '')
  // Deep link from a task row in Student Progress: open THIS submission in
  // the grader. The completion may already be reviewed, so if the New list
  // doesn't hold it we flip to Reviewed once before giving up.
  const targetCompletion = useRef(searchParams.get('completion_id') || null)
  // Only the class page sends ?from=progress, so picking a class from the
  // filter below never invents a "back" link to somewhere you have not been.
  const [cameFromClassId] = useState(
    () => (searchParams.get('from') === 'progress' && searchParams.get('class_id')) || '')
  const [classes, setClasses] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [counts, setCounts] = useState({ new: 0, reviewed: 0 })
  // Size of the list being paged (after the search), for Load more.
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // The submission open in the grader; null is the queue.
  const [openId, setOpenId] = useState(null)
  // Rows ticked for the bulk bar.
  const [checked, setChecked] = useState([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const decisionRef = useRef(null)
  // Search by student name, task title or quest title. iCreate, ticket
  // 0e6cb0fc (2026-09-23): "It would be nice to have a search bar to be able
  // to find a past reviewed task easily." Reviewed stopped at the newest 50
  // with no way further back, so search runs on the server over the whole
  // list, and Load more walks the rest of it.
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!orgId || !classesOn) return
    api.get(withOrg('/api/sis/classes', orgId))
      .then((r) => setClasses(r.data?.classes || []))
      .catch(() => { /* class filter stays empty */ })
  }, [orgId, classesOn])

  // When the list (and the signed evidence URLs in it) last arrived.
  const loadedAt = useRef(0)
  const load = useCallback(({ quiet = false } = {}) => {
    if (!orgId) return
    if (!quiet) setLoading(true)
    // A new scope, class or search always starts again at the first page.
    api.get(withOrg(`/api/sis/submissions?${listParams(scope, classId, search, 0)}`, orgId))
      .then((r) => {
        loadedAt.current = Date.now()
        const list = r.data?.submissions || []
        setSubmissions(list)
        setCounts(r.data?.counts || { new: 0, reviewed: 0 })
        setTotal(r.data?.total ?? list.length)
        const have = new Set(list.map((s) => s.completion_id))
        setChecked((ids) => ids.filter((id) => have.has(id)))
        const target = targetCompletion.current
        if (target && have.has(target)) {
          targetCompletion.current = null
          setOpenId(target)
          return
        }
        if (target && scope === 'new') {
          setScope('reviewed') // re-runs load; target found there or dropped below
          return
        }
        targetCompletion.current = null
        // A quiet refresh keeps the grader where it is while the item is
        // still there; a new list closes it.
        setOpenId((prev) => (prev && have.has(prev) ? prev : null))
      })
      .catch(() => toast.error('Failed to load submissions'))
      .finally(() => { if (!quiet) setLoading(false) })
  }, [orgId, scope, classId, search])

  useEffect(() => { load() }, [load])

  // The next page, after the rows already on screen. Accept and un-review
  // take rows out of the server's list as they take them off the screen, so
  // the count on screen is the right offset.
  const loadMore = () => {
    if (!orgId || loadingMore) return
    setLoadingMore(true)
    api.get(withOrg(
      `/api/sis/submissions?${listParams(scope, classId, search, submissions.length)}`, orgId))
      .then((r) => {
        const more = r.data?.submissions || []
        setSubmissions((subs) => {
          const have = new Set(subs.map((s) => s.completion_id))
          return [...subs, ...more.filter((s) => !have.has(s.completion_id))]
        })
        if (r.data?.total != null) setTotal(r.data.total)
      })
      .catch(() => toast.error('Failed to load more submissions'))
      .finally(() => setLoadingMore(false))
  }

  // The evidence links are signed URLs, good for an hour from the load above.
  // A teacher who read through the class and clicked "poems.pdf" seventy
  // minutes later got Supabase's InvalidJWT page instead (Gryffin,
  // 2026-09-15, d270e78f). So the list is fetched again, without the loading
  // flash, when the tab comes back after a while and on a timer well inside
  // the hour -- fresh signatures under the same links.
  useEffect(() => {
    const STALE_MS = 10 * 60 * 1000
    const refresh = () => { if (Date.now() - loadedAt.current > STALE_MS) load({ quiet: true }) }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const timer = setInterval(refresh, 20 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      clearInterval(timer)
    }
  }, [load])

  const open = useMemo(
    () => submissions.find((s) => s.completion_id === openId) || null,
    [submissions, openId],
  )
  const openIndex = submissions.findIndex((s) => s.completion_id === openId)

  // Move through the queue. From the queue itself, j opens the first one,
  // as in the credit grader.
  const move = useCallback((delta) => {
    if (!submissions.length) return
    const idx = submissions.findIndex((s) => s.completion_id === openId)
    if (idx < 0) {
      setOpenId(submissions[0].completion_id)
      return
    }
    const next = submissions[idx + delta]
    if (next) setOpenId(next.completion_id)
  }, [submissions, openId])

  // A decision (Accept or Grow This): write the review, take the submission
  // out of the New queue, and open the next one.
  //
  // Unless it was the last one. Working a queue, the next submission is the
  // answer; arriving on ONE submission from a student's progress row, it is not
  // — the queue empties, the pane goes blank, and the only thing that ever said
  // "reviewed" was a toast that had already gone. Reloading the page found it
  // again under Reviewed, which is the whole of the report: "when I accept
  // tasks, there isn't any change until I refresh my page then it shows as
  // reviewed" (Nicole Connole, 2026-09-04). So the last one stays on screen,
  // wearing the state it just earned.
  const decide = async (sub, action, note) => {
    try {
      const body = { action, organization_id: orgId }
      if (note) body.feedback = note
      const r = await api.post(`/api/sis/submissions/${sub.completion_id}/review`, body)
      const idx = submissions.findIndex((s) => s.completion_id === sub.completion_id)
      const rest = submissions.filter((s) => s.completion_id !== sub.completion_id)
      setTotal((t) => Math.max(0, t - 1))
      setChecked((ids) => ids.filter((id) => id !== sub.completion_id))
      if (rest.length) {
        setSubmissions(rest)
        setOpenId(rest[Math.min(idx, rest.length - 1)]?.completion_id || null)
      } else {
        // The review row the server just wrote, so the panel reads back exactly
        // what a reload would have shown it.
        setSubmissions([{ ...sub, review: r.data?.review || { action } }])
        setOpenId(sub.completion_id)
      }
      setCounts((c) => ({ new: Math.max(0, c.new - 1), reviewed: c.reviewed + 1 }))
      toast.success(action === 'grow_this' ? 'Sent back to grow' : 'Accepted')
    } catch (e) {
      toast.error(e.response?.data?.error
        || (action === 'grow_this' ? 'Could not send it back' : 'Could not accept submission'))
    }
  }

  // Un-review an accidental accept. Usually from the Reviewed list, where the
  // submission then belongs elsewhere and leaves; but also from an accept that
  // was just made and is still on screen, where "back to New" means the
  // submission stays exactly where it is and loses its review.
  const unreview = async (sub) => {
    try {
      await api.delete(withOrg(`/api/sis/submissions/${sub.completion_id}/review`, orgId))
      if (scope === 'new') {
        setSubmissions((subs) => subs.map((s) => (
          s.completion_id === sub.completion_id ? { ...s, review: null } : s)))
      } else {
        const idx = submissions.findIndex((s) => s.completion_id === sub.completion_id)
        const next = submissions.filter((s) => s.completion_id !== sub.completion_id)
        setTotal((t) => Math.max(0, t - 1))
        setSubmissions(next)
        setOpenId(next[Math.min(idx, next.length - 1)]?.completion_id || null)
      }
      setCounts((c) => ({ new: c.new + 1, reviewed: Math.max(0, c.reviewed - 1) }))
      toast.success('Moved back to New')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not un-review submission')
    }
  }

  // Bulk accept: one request for the whole selection. The server checks each
  // one against this teacher's inbox and skips any already accepted, so the
  // list is read again rather than guessed at.
  const bulkAccept = async () => {
    if (!checked.length || bulkBusy) return
    setBulkBusy(true)
    try {
      const r = await api.post('/api/sis/submissions/bulk-review', {
        completion_ids: checked, action: 'accepted', organization_id: orgId,
      })
      const done = r.data?.reviewed?.length ?? 0
      const skipped = r.data?.skipped?.length ?? 0
      toast.success(skipped
        ? `Accepted ${done}. ${skipped} skipped: already accepted or not in your classes.`
        : `Accepted ${done}`)
      setChecked([])
      load({ quiet: true })
    } catch (e) {
      toast.error(e.response?.data?.error || 'Bulk accept failed')
    } finally {
      setBulkBusy(false)
    }
  }

  const setXp = (completionId, xp) => {
    setSubmissions((subs) => subs.map((s) =>
      s.completion_id === completionId ? { ...s, task: { ...s.task, xp_value: xp } } : s))
  }

  // The same keys as the credit grader. a and g belong to the grader, which
  // registers them on decisionRef; nothing here decides anything itself.
  const shortcuts = useMemo(() => ({
    j: () => move(1),
    k: () => move(-1),
    a: () => decisionRef.current?.accept(),
    g: () => decisionRef.current?.growThis(),
    Escape: () => {
      if (showShortcuts) setShowShortcuts(false)
      else setOpenId(null)
    },
    '?': () => setShowShortcuts((s) => !s),
  }), [move, showShortcuts])
  useKeyboardShortcuts(shortcuts)

  // 'individual' lists only work on quests a teacher gave one student by name,
  // outside any class (2026-10-07); the server reads it as that filter.
  const classOptions = useMemo(
    () => [{ id: '', name: 'All classes' }, { id: 'individual', name: 'Individual students' }, ...classes],
    [classes],
  )

  const columns = useMemo(() => [
    { key: 'student', header: <QueueHeader>Student</QueueHeader>,
      cellClassName: 'px-3 py-2 text-sm text-gray-900', cell: (s) => s.student?.name },
    { key: 'task', header: <QueueHeader>Task</QueueHeader>,
      cellClassName: 'px-3 py-2 text-sm text-gray-700 max-w-[220px] truncate', cell: (s) => s.task?.title },
    { key: 'quest', header: <QueueHeader className="hidden md:table-cell">Quest</QueueHeader>,
      cellClassName: 'hidden md:table-cell px-3 py-2 text-sm text-gray-500 max-w-[160px] truncate',
      cell: (s) => s.quest_title },
    { key: 'class', header: <QueueHeader className="hidden md:table-cell">Class</QueueHeader>,
      cellClassName: 'hidden md:table-cell px-3 py-2 text-sm text-gray-500 max-w-[160px] truncate',
      cell: (s) => s.class_name || '-' },
    { key: 'xp', header: <QueueHeader className="hidden sm:table-cell">XP</QueueHeader>,
      cellClassName: 'hidden sm:table-cell px-3 py-2 text-sm font-medium text-gray-900',
      cell: (s) => s.task?.xp_value ?? 0 },
    { key: 'evidence', header: <QueueHeader className="hidden lg:table-cell">Evidence</QueueHeader>,
      cellClassName: 'hidden lg:table-cell px-3 py-2 text-xs text-gray-500',
      cell: (s) => (s.evidence_blocks || []).length },
    { key: 'status', header: <QueueHeader>Status</QueueHeader>,
      cellClassName: 'px-3 py-2', cell: (s) => <StatusChip review={s.review} /> },
    { key: 'date', header: <QueueHeader className="hidden sm:table-cell">Submitted</QueueHeader>,
      cellClassName: 'hidden sm:table-cell px-3 py-2 text-xs text-gray-400',
      cell: (s) => timeAgo(s.completed_at) },
  ], [])

  const scopeTab = (key, label) => (
    <button
      key={key}
      type="button"
      onClick={() => setScope(key)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        scope === key
          ? 'bg-gradient-primary text-white'
          : 'bg-white border border-gray-200 text-gray-600 hover:border-optio-purple/50'
      }`}
    >
      {label} ({counts[key] ?? 0})
    </button>
  )

  return (
    <div>
      {/* Arrived from a class's Student Progress tab? Offer the way back.
          Without it the return trip is the sidebar, then the class, then
          re-picking the tab (Gryffin, 2026-09-02: "regularly going back and
          forth ... especially on the return trip back to progress as I also
          then have to reclick the correct tab"). */}
      {cameFromClassId && (
        <Link
          to={`/my-classes/${cameFromClassId}?tab=progress`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-optio-purple mb-2"
        >
          <ArrowLeftIcon className="w-4 h-4" /> Back to student progress
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {scopeTab('new', 'New')}
        {scopeTab('reviewed', 'Reviewed')}
        {classesOn && <SearchSelect
          className="w-full sm:w-64"
          value={classId}
          onChange={setClassId}
          options={classOptions}
          getId={(c) => c.id}
          getLabel={classLabel}
          placeholder="Filter by class…"
        />}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search student, task or quest…"
          aria-label="Search submissions"
          className="w-full sm:w-64 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple"
        />
        <div className="flex items-center gap-2 sm:ml-auto">
          {submissions.length > 0 && (
            <button
              type="button"
              onClick={() => setOpenId(submissions[0].completion_id)}
              className="btn-primary"
            >
              Start reviewing
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            className="btn-quiet px-2.5 text-gray-500 hidden md:inline-flex"
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
          >
            ?
          </button>
        </div>
      </div>

      {!loading && submissions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          {search ? (
            <p className="text-lg font-semibold text-gray-900">
              {`No ${scope === 'new' ? 'new' : 'reviewed'} submissions match "${search}".`}
            </p>
          ) : (
            <>
              <p className="text-lg font-semibold text-gray-900">You're all caught up.</p>
              <p className="text-sm text-gray-500 mt-1">
                {scope === 'new'
                  ? 'No new submissions from your classes.'
                  : 'Nothing has been reviewed yet.'}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <ReviewQueueTable
              items={submissions}
              columns={columns}
              rowLabel={(s) => `${s.student?.name || 'student'}: ${s.task?.title || 'task'}`}
              selectedIds={checked}
              onToggleSelection={(id) => setChecked((ids) => (
                ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))}
              onSelectAll={setChecked}
              onRowClick={(s) => setOpenId(s.completion_id)}
              loading={loading}
              emptyText="No submissions"
            />
          </div>
          {!loading && submissions.length < total && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="block w-full border-t border-gray-200 px-4 py-3 text-sm font-medium text-optio-purple hover:bg-optio-purple/5 disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : `Load more (${total - submissions.length} more)`}
            </button>
          )}
        </div>
      )}

      {/* The bulk bar. Accept only: sending work back needs a note written for
          that one student, so it is done one at a time in the grader. */}
      {!open && checked.length > 0 && (
        <FloatingActionBar count={checked.length} onDeselectAll={() => setChecked([])}>
          <button
            type="button"
            onClick={bulkAccept}
            disabled={bulkBusy}
            className="px-3 py-1.5 text-sm bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {bulkBusy ? 'Accepting…' : 'Accept all'}
          </button>
        </FloatingActionBar>
      )}

      {/* The grader covers everything, app chrome included. */}
      {open && (
        <SubmissionGrader
          sub={open}
          orgId={orgId}
          index={openIndex}
          total={submissions.length}
          onPrev={() => move(-1)}
          onNext={() => move(1)}
          onExit={() => setOpenId(null)}
          onShowShortcuts={() => setShowShortcuts(true)}
          onDecide={decide}
          onUnreview={unreview}
          onXpChanged={setXp}
          decisionRef={decisionRef}
        />
      )}

      {showShortcuts && (
        <ShortcutHelp shortcuts={SHORTCUTS} onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  )
}
