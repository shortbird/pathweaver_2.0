import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import QuestListItem from '../components/quest/QuestListItem'
import api from '../services/api'
import ChecklistAssignments from '../components/sis/ChecklistAssignments'
import { useFamilyOrgSelection } from '../hooks/api/useSchoolContext'
import { useEndMemberQuest } from '../hooks/api/useFamilyQuests'
import { useConfirm } from '../contexts/ConfirmContext'

/**
 * Forms (Learning app) — the one page for paperwork between a family and its
 * school, in the order a parent needs it:
 *
 *   1. To complete — what the school needs from you. Checklists to tick,
 *      documents to upload, forms to sign by typed name (all of it in
 *      components/sis/ChecklistAssignments over /api/sis/parent/onboarding),
 *      and quests the school set for families (/api/sis/parent/quests).
 *   2. Your requests — what you need from the school. A request lands in the
 *      same staff queue the office already works (tagged as from a parent),
 *      and the office's reply shows up under it here. /api/sis/parent/forms.
 *
 * Until 2026-09-16 these were two sidebar items: "Checklists" (/family/portal,
 * titled "Your portal") and "Requests" (this path). The split was by
 * direction — school-to-family versus family-to-school — which is how the
 * backend is organised and not how a parent thinks about it. An iCreate parent
 * met two abstract nouns side by side, one of which was empty for most
 * families; and a "checklist" at iCreate is a form to sign (Family Service
 * Program Form, Student Behavior Agreement Form), so the word matched nothing
 * they had been sent. One door, named for what the office calls all of it.
 * /family/portal redirects here; older notifications still carry it.
 *
 * Each half is gated by its own building block (onboarding, forms) off the
 * org's family-surface module list, so a school that runs only one sees only
 * that one, without a heading over an empty room.
 */

const STATUS_STYLES = {
  submitted: 'bg-gray-100 text-gray-600',
  under_review: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-blue-100 text-blue-700',
  waiting: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-700',
}

// The office's vocabulary is a work queue (submitted, under review, in
// progress, waiting, resolved); a parent only needs to know whether the
// office has it, or has answered.
const STATUS_LABELS = {
  submitted: 'Sent',
  under_review: 'With the office',
  in_progress: 'With the office',
  waiting: 'Waiting',
  resolved: 'Answered',
}

const StatusPill = ({ status }) => (
  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[status] || STATUS_STYLES.submitted}`}>
    {STATUS_LABELS[status] || String(status || '').replace('_', ' ')}
  </span>
)

// Same wording the staff training page uses, so a parent who is also a teacher
// reads one vocabulary across both portals.
const questProgressLabel = (p) => {
  if (!p?.started) return 'Not started'
  if (p.completed) return 'Complete'
  if (!p.total) return 'In progress'
  return `${p.done} of ${p.total} tasks`
}

const questProgressStyle = (p) => {
  if (!p?.started) return 'bg-gray-100 text-gray-500'
  if (p.completed) return 'bg-green-100 text-green-700'
  return 'bg-amber-100 text-amber-800'
}

// The org entry from /api/sis/parent/context names which family-surface
// modules the school runs. An older payload without the list means "show
// everything", the same fallback the school hub uses (school/schoolCards).
const moduleOn = (org, key) => !Array.isArray(org?.modules) || org.modules.includes(key)

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

/** Quests the school set for families — back to school night and the like.
 *  Yours, on your own account: this is not your child's work.
 *
 *  Only the ones still open. A finished or ended quest belongs to the
 *  parent's own completed quests, not to a section headed "To complete".
 *
 *  Every open quest can be ended from here. The school auto-assigns these
 *  (iCreate Exploration Quest went to 80 parents, none of whom finished it),
 *  and until 2026-09-16 the row offered Start and Continue and nothing else:
 *  a parent who did not want the quest had it on this page for good, and the
 *  quest page's own End button refused them below the quest's XP goal.
 *  Ending here goes through the same route with `force`, keeps the work and
 *  XP, and can be undone from the completed quests list. The
 *  auto-assign catch-up in sis_parent_service.school_quests only enrols
 *  families with NO row, and an ended quest keeps its row, so it stays ended. */
function FamilyQuests({ quests, orgName, onEnd, ending }) {
  const open = quests.filter((q) => !q.progress?.completed)
  if (!open.length) return null
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Quests from {orgName}</h3>
      <p className="text-sm text-gray-500 mb-3">
        These are yours to do. Open one to start it, and your progress shows up here.
      </p>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {open.map((q) => (
          <QuestListItem key={q.quest_id} quest={q} className="p-4" imageSize="sm"
            badges={(
              <>
                {q.is_required && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-optio-purple/10 text-optio-purple">
                    Required
                  </span>
                )}
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${questProgressStyle(q.progress)}`}>
                  {questProgressLabel(q.progress)}
                </span>
              </>
            )}>
            <div className="flex items-center gap-4 mt-1">
              <Link to={`/quests/${q.quest_id}`} className="text-sm text-optio-purple hover:underline">
                {q.progress?.started ? 'Continue' : 'Start this quest'}
              </Link>
              {q.progress?.started && (
                <button type="button" onClick={() => onEnd(q)} disabled={ending}
                  className="text-sm text-gray-500 hover:text-gray-700 hover:underline disabled:opacity-50">
                  End quest
                </button>
              )}
            </div>
          </QuestListItem>
        ))}
      </div>
    </div>
  )
}

/** Training the school set for families that is a video or a document rather
 *  than a quest — a recorded back-to-school night, a handbook to read.
 *
 *  "It'd be nice to be able to upload the training from last friday without
 *  creating an entire quest" (iCreate, Molly, 2026-09-22, ae16c5da). There is
 *  nothing to break into tasks, so there is nothing to make a quest out of:
 *  open it, press Done. Done is a sis_resource_acks row, the same record a
 *  required document uses, which is what lets the office see who has watched.
 *
 *  A required one is the school asking; an optional one is simply there. Both
 *  are listed, because a parent deciding what to do tonight wants to see both.
 */
function FamilyTrainingLinks({ links, orgName, onToggleDone, busyId }) {
  if (!links.length) return null
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Watch or read from {orgName}</h3>
      <p className="text-sm text-gray-500 mb-3">
        Open each one, then mark it done so the school knows you have seen it.
      </p>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {links.map((l) => (
          <div key={l.id} className="p-3 flex items-center gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <a href={l.url} target="_blank" rel="noopener noreferrer"
                className="text-sm font-medium text-optio-purple hover:underline">
                {l.title}
              </a>
              {l.description && (
                <p className="text-xs text-gray-500 mt-0.5">{l.description}</p>
              )}
            </div>
            {l.is_required && !l.my_done && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
                Required
              </span>
            )}
            {l.my_done ? (
              <button type="button" onClick={() => onToggleDone(l, false)} disabled={busyId === l.id}
                className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 shrink-0 disabled:opacity-50">
                Done — undo
              </button>
            ) : (
              <button type="button" onClick={() => onToggleDone(l, true)} disabled={busyId === l.id}
                className="btn-primary text-xs px-3 py-1 shrink-0 disabled:opacity-50">
                {busyId === l.id ? 'Saving…' : 'Mark done'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const FamilyFormsPage = () => {
  // One shared read of where this person is a guardian (hooks/api/
  // useSchoolContext); the student picker starts on the child the parent
  // already picked on the family dashboard, or blank for the whole family.
  const { orgs, org, orgId, setOrgId, students, scopedStudentId, loading, isError } = useFamilyOrgSelection()
  const location = useLocation()
  const confirm = useConfirm()
  const endQuest = useEndMemberQuest()
  const orgName = org?.organization_name || 'your school'
  const showChecklists = moduleOn(org, 'onboarding')
  const showRequests = moduleOn(org, 'forms')
  // Training links are the `training` module's, not the checklist module's --
  // the route says so (@require_module('training')). A school that runs
  // training without onboarding checklists would otherwise never see the
  // video it set for its families.
  const showTraining = moduleOn(org, 'training')

  // To complete.
  const [assignments, setAssignments] = useState([])
  const [quests, setQuests] = useState([])
  const [trainingLinks, setTrainingLinks] = useState([])
  const [markingTraining, setMarkingTraining] = useState(null)

  // Your requests.
  const [studentId, setStudentId] = useState('')
  const [formTypes, setFormTypes] = useState({})
  const [submissions, setSubmissions] = useState(null) // null until the first answer
  const [form, setForm] = useState({ form_type: '', title: '', body: '' })
  const [composing, setComposing] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isError) toast.error('Could not load your family')
  }, [isError])

  // Start on the scoped child; keep the selection valid when the org changes
  // (blank = whole family).
  useEffect(() => {
    if (scopedStudentId) setStudentId((cur) => cur || scopedStudentId)
  }, [scopedStudentId])
  useEffect(() => {
    if (studentId && !students.some((s) => s.student_id === studentId)) setStudentId('')
  }, [students, studentId])

  const loadChecklists = useCallback(() => {
    if (!orgId) { setAssignments([]); setQuests([]); setTrainingLinks([]); return }
    if (!showChecklists) { setAssignments([]); setQuests([]) }
    if (showChecklists) {
      api.get(`/api/sis/parent/onboarding?organization_id=${orgId}`)
        .then((r) => setAssignments(r.data?.assignments || []))
        .catch(() => toast.error('Could not load your checklists'))
    }
    // A school with no family quests set is the normal case, so this failing
    // must not take the checklists down with it.
    if (showChecklists) {
      api.get(`/api/sis/parent/quests?organization_id=${orgId}`)
        .then((r) => setQuests(r.data?.quests || []))
        .catch(() => setQuests([]))
    }
    // Same reasoning as the quests above: a school that has set no family
    // training links is the normal case, so this failing is quiet.
    if (showTraining) {
      api.get(`/api/sis/parent/training?organization_id=${orgId}`)
        .then((r) => setTrainingLinks(r.data?.training || []))
        .catch(() => setTrainingLinks([]))
    } else {
      setTrainingLinks([])
    }
  }, [orgId, showChecklists, showTraining])

  const loadRequests = useCallback(() => {
    if (!orgId || !showRequests) { setSubmissions([]); setFormTypes({}); return }
    api.get(`/api/sis/parent/forms?organization_id=${orgId}`)
      .then((r) => {
        setSubmissions(r.data?.submissions || [])
        const types = r.data?.form_types || {}
        setFormTypes(types)
        setForm((f) => ({ ...f, form_type: f.form_type || Object.keys(types)[0] || '' }))
      })
      .catch(() => toast.error('Could not load your requests'))
  }, [orgId, showRequests])

  useEffect(() => { loadChecklists() }, [loadChecklists])
  useEffect(() => { loadRequests() }, [loadRequests])

  // The family home's "open requests" card lands on the second half.
  useEffect(() => {
    if (location.hash !== '#requests' || submissions === null) return
    document.getElementById('requests')?.scrollIntoView({ block: 'start' })
  }, [location.hash, submissions])

  const endFamilyQuest = async (q) => {
    const remaining = Math.max((q.progress?.total || 0) - (q.progress?.done || 0), 0)
    const message = remaining > 0
      ? `End "${q.title}"? ${remaining} task${remaining === 1 ? '' : 's'} ${remaining === 1 ? 'is' : 'are'} still unfinished. Finished work and XP are kept, and you can reopen it later from your completed quests.`
      : `End "${q.title}"? Work and XP are kept, and you can reopen it later from your completed quests.`
    if (!(await confirm(message))) return
    // force: leaving, not finishing for credit -- see useEndMemberQuest.
    endQuest.mutate({ questId: q.quest_id, studentId: null, force: true }, {
      onSuccess: () => { toast.success(`You ended ${q.title}`); loadChecklists() },
      onError: (err) => toast.error(err?.response?.data?.error || 'Could not end the quest'),
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.form_type) { toast.error('Pick a request type'); return }
    if (!form.body.trim()) { toast.error('Please describe your request'); return }
    setBusy(true)
    try {
      await api.post('/api/sis/parent/forms', {
        organization_id: orgId,
        form_type: form.form_type,
        title: form.title.trim() || undefined,
        body: form.body.trim(),
        student_user_id: studentId || undefined,
      })
      toast.success(`Sent — ${orgName} has been notified`)
      setForm({ form_type: Object.keys(formTypes)[0] || '', title: '', body: '' })
      setStudentId('')
      setComposing(false)
      loadRequests()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not send your request')
    } finally {
      setBusy(false)
    }
  }

  const studentNameById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.student_id, s.name])),
    [students],
  )

  if (loading) {
    return <div className="max-w-3xl mx-auto py-10 text-gray-500">Loading…</div>
  }

  if (isError || !orgs.length) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-gray-500">
          Nothing here yet. If your school uses Optio, ask them to add your family.
        </p>
      </div>
    )
  }

  const openQuests = quests.filter((q) => !q.progress?.completed)
  const nothingToComplete = !assignments.length && !openQuests.length && !trainingLinks.length

  // Optimistic, then reconciled from the server's own row: the button is the
  // whole interaction, so it has to answer immediately.
  const toggleTrainingDone = async (link, done) => {
    setMarkingTraining(link.id)
    try {
      const url = `/api/sis/parent/training/${link.id}/done?organization_id=${orgId}`
      // The empty object is required, not decoration: without a body axios
      // omits Content-Type and the CSRF middleware refuses the request
      // (src/__tests__/csrfRequestBody.test.js).
      const res = done ? await api.post(url, {}) : await api.delete(url)
      const updated = res.data?.training
      setTrainingLinks((prev) => prev.map((l) => (l.id === link.id ? (updated || l) : l)))
    } catch {
      toast.error('Could not save that')
    } finally {
      setMarkingTraining(null)
    }
  }
  // A parent with no request on file came here to send one: the composer is
  // open. Once there is history, the history is the page and the composer is a
  // button, so the list of what the office has answered is not pushed below a
  // blank form.
  const composerOpen = composing || (submissions !== null && submissions.length === 0)

  // A tab of the school page (pages/school/SchoolShell): the shell carries
  // the letterhead and the rail, this is the panel.
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8 gap-3">
        <p className="text-sm text-gray-500">
          What {orgName} needs from you, and what you need from {orgName}.
        </p>
        {orgs.length > 1 && (
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}
            aria-label="School"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization_name || 'School'}</option>)}
          </select>
        )}
      </div>

      {(showChecklists || showTraining) && (
        <section id="to-complete" aria-labelledby="to-complete-heading" className="mb-10 space-y-4">
          <h2 id="to-complete-heading" className="text-lg font-semibold text-gray-900">To complete</h2>
          {nothingToComplete ? (
            <p className="text-sm text-gray-400">Nothing to sign or complete right now.</p>
          ) : (
            <>
              {assignments.length > 0 && (
                <ChecklistAssignments orgId={orgId} assignments={assignments} onChanged={loadChecklists} />
              )}
              <FamilyQuests quests={quests} orgName={orgName} onEnd={endFamilyQuest} ending={endQuest.isPending} />
              <FamilyTrainingLinks links={trainingLinks} orgName={orgName}
                onToggleDone={toggleTrainingDone} busyId={markingTraining} />
            </>
          )}
        </section>
      )}

      {showRequests && (
        <section id="requests" aria-labelledby="requests-heading" className="scroll-mt-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 id="requests-heading" className="text-lg font-semibold text-gray-900">Your requests</h2>
            {!composerOpen && (
              <button type="button" onClick={() => setComposing(true)} className="btn-primary">
                New request
              </button>
            )}
          </div>

          {composerOpen && (
            <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-4 mb-6 space-y-3">
              <p className="text-sm text-gray-500">
                Ask {orgName} for what you need. They see it come in and reply here.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block text-gray-500 mb-1">What is it about?</span>
                  <select value={form.form_type} onChange={(e) => setForm({ ...form, form_type: e.target.value })} className={inputClass}>
                    {Object.entries(formTypes).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </label>
                {students.length > 0 && (
                  <label className="text-sm">
                    <span className="block text-gray-500 mb-1">Which child? (optional)</span>
                    <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className={inputClass}>
                      <option value="">Not about a specific child</option>
                      {students.map((s) => <option key={s.student_id} value={s.student_id}>{s.name}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <label className="text-sm block">
                <span className="block text-gray-500 mb-1">Short title (optional)</span>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  maxLength={120} placeholder="e.g. Receipt for the enrollment fee" className={inputClass} />
              </label>
              <label className="text-sm block">
                <span className="block text-gray-500 mb-1">Details</span>
                <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={4} placeholder={`Tell ${orgName} what you need.`}
                  className={`${inputClass} resize-none`} />
              </label>
              <div className="flex justify-end gap-2">
                {submissions?.length > 0 && (
                  <button type="button" onClick={() => setComposing(false)} className="btn-secondary">
                    Cancel
                  </button>
                )}
                <button type="submit" disabled={busy} className="btn-primary">
                  {busy ? 'Sending…' : 'Send request'}
                </button>
              </div>
            </form>
          )}

          {submissions !== null && !submissions.length && !composerOpen && (
            <p className="text-sm text-gray-400">You have not sent a request yet.</p>
          )}
          <ul className="space-y-2">
            {(submissions || []).map((f) => (
              <li key={f.id} className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{f.form_type_label}</span>
                  <span className="font-medium text-gray-900">{f.title}</span>
                  <StatusPill status={f.status} />
                  <span className="text-xs text-gray-400 ml-auto">{new Date(f.created_at).toLocaleDateString()}</span>
                </div>
                {f.student_user_id && (
                  <p className="text-xs text-gray-400 mt-1">
                    About {f.student_name || studentNameById[f.student_user_id] || 'a child'}
                  </p>
                )}
                {f.payload?.body && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{f.payload.body}</p>}
                {f.resolution_notes && (
                  <p className="text-sm text-green-800 mt-2 pl-3 border-l-2 border-green-300 whitespace-pre-wrap">
                    {orgName} replied: {f.resolution_notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default FamilyFormsPage
