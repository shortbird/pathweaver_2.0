import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import QuestListItem from '../components/quest/QuestListItem'
import api from '../services/api'
import TaskCard from '../components/sis/tasks/TaskCard'
import { taskApi } from '../hooks/api/useTasks'
import { useFamilyOrgSelection } from '../hooks/api/useSchoolContext'
import { useEndMemberQuest } from '../hooks/api/useFamilyQuests'
import { useConfirm } from '../contexts/ConfirmContext'

/**
 * To do (Learning app) -- what the school is waiting on this family for, in
 * one list: tasks from the office (a step to tick, a document to upload, a
 * form to sign by typing a name), the quests the school set for families, and
 * the videos and documents it asked them to watch or read.
 *
 * Renamed from Forms on 2026-09-24 (iCreate meeting 2026-09-23). Families no
 * longer file forms or requests: they message the school, and the office turns
 * the message into a task on its side. So the "Your requests" half of this
 * page went, and what is left is a to-do list, named for what it is. The path
 * stays /family/forms because every notification and email sent before the
 * rename carries it; /family/portal redirects here too.
 *
 * Each task is a TaskCard (components/sis/tasks), the same card a teacher and
 * a student work their tasks on, with its comment thread: a family can read
 * and answer what the office wrote on their task.
 */

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
  // useSchoolContext).
  const { orgs, org, orgId, setOrgId, loading, isError } = useFamilyOrgSelection()
  const [searchParams] = useSearchParams()
  const openTaskId = searchParams.get('task')
  const confirm = useConfirm()
  const endQuest = useEndMemberQuest()
  const orgName = org?.organization_name || 'your school'
  const showTasks = moduleOn(org, 'tasks') || moduleOn(org, 'onboarding')
  // Training links are the `training` module's, not the tasks module's -- the
  // route says so (@require_module('training')). A school that runs training
  // without tasks would otherwise never see the video it set for families.
  const showTraining = moduleOn(org, 'training')

  const [tasks, setTasks] = useState([])
  const [signatureStatement, setSignatureStatement] = useState(null)
  const [showDone, setShowDone] = useState(false)
  const [quests, setQuests] = useState([])
  const [trainingLinks, setTrainingLinks] = useState([])
  const [markingTraining, setMarkingTraining] = useState(null)

  useEffect(() => {
    if (isError) toast.error('Could not load your family')
  }, [isError])

  const loadTasks = useCallback(() => {
    if (!orgId || !showTasks) { setTasks([]); return }
    api.get(`/api/sis/tasks/mine?audience=family&organization_id=${orgId}${showDone ? '&include_done=1' : ''}`)
      .then((r) => {
        setTasks(r.data?.tasks || [])
        setSignatureStatement(r.data?.signature_statement || null)
      })
      .catch(() => toast.error('Could not load your tasks'))
  }, [orgId, showTasks, showDone])

  const loadRest = useCallback(() => {
    if (!orgId) { setQuests([]); setTrainingLinks([]); return }
    // A school with no family quests set is the normal case, so this failing
    // must not take the tasks down with it.
    if (showTasks) {
      api.get(`/api/sis/parent/quests?organization_id=${orgId}`)
        .then((r) => setQuests(r.data?.quests || []))
        .catch(() => setQuests([]))
    } else {
      setQuests([])
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
  }, [orgId, showTasks, showTraining])

  useEffect(() => { loadTasks() }, [loadTasks])
  useEffect(() => { loadRest() }, [loadRest])

  const endFamilyQuest = async (q) => {
    const remaining = Math.max((q.progress?.total || 0) - (q.progress?.done || 0), 0)
    const message = remaining > 0
      ? `End "${q.title}"? ${remaining} task${remaining === 1 ? '' : 's'} ${remaining === 1 ? 'is' : 'are'} still unfinished. Finished work and XP are kept, and you can reopen it later from your completed quests.`
      : `End "${q.title}"? Work and XP are kept, and you can reopen it later from your completed quests.`
    if (!(await confirm(message))) return
    // force: leaving, not finishing for credit -- see useEndMemberQuest.
    endQuest.mutate({ questId: q.quest_id, studentId: null, force: true }, {
      onSuccess: () => { toast.success(`You ended ${q.title}`); loadRest() },
      onError: (err) => toast.error(err?.response?.data?.error || 'Could not end the quest'),
    })
  }

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

  const { open, finished } = useMemo(() => ({
    open: tasks.filter((t) => !['done', 'expired'].includes(t.status)),
    finished: tasks.filter((t) => ['done', 'expired'].includes(t.status)),
  }), [tasks])

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
  const nothingToDo = !open.length && !openQuests.length && !trainingLinks.length

  // A tab of the school page (pages/school/SchoolShell): the shell carries
  // the letterhead and the rail, this is the panel.
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <p className="text-sm text-gray-500">
          What {orgName} is waiting on you for. Need something from {orgName}?{' '}
          <Link to="/messages" className="text-optio-purple hover:underline">Send them a message</Link>.
        </p>
        {orgs.length > 1 && (
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}
            aria-label="School"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization_name || 'School'}</option>)}
          </select>
        )}
      </div>

      <section id="to-do" aria-labelledby="to-do-heading" className="mb-10 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="to-do-heading" className="text-lg font-semibold text-gray-900">To do</h2>
          {showTasks && (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)}
                className="h-4 w-4 accent-optio-purple" />
              Show finished
            </label>
          )}
        </div>
        {nothingToDo && (
          <p className="text-sm text-gray-400">Nothing to do right now.</p>
        )}
        {open.length > 0 && (
          <ul className="space-y-3">
            {open.map((t) => (
              <li key={t.id}>
                <TaskCard task={t} api={taskApi} statement={signatureStatement}
                  onChanged={loadTasks} highlighted={openTaskId === t.id} />
              </li>
            ))}
          </ul>
        )}
        <FamilyQuests quests={quests} orgName={orgName} onEnd={endFamilyQuest} ending={endQuest.isPending} />
        <FamilyTrainingLinks links={trainingLinks} orgName={orgName}
          onToggleDone={toggleTrainingDone} busyId={markingTraining} />
        {showDone && finished.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Finished</h3>
            <ul className="space-y-3">
              {finished.map((t) => (
                <li key={t.id}>
                  <TaskCard task={t} api={taskApi} statement={signatureStatement}
                    onChanged={loadTasks} highlighted={openTaskId === t.id} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}

export default FamilyFormsPage
