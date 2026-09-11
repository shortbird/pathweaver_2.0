import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  PlusIcon, TrashIcon, AcademicCapIcon, ChevronDownIcon, ChevronRightIcon,
  CalendarDaysIcon, ClockIcon, UsersIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import QuestDraftForm, { blankTask } from './QuestDraftForm'
import QuestAiDraftPanel from './QuestAiDraftPanel'
import PresetTaskManager from './PresetTaskManager'
import { useConfirm } from '../../contexts/ConfirmContext'

/**
 * ClassQuestsManager — the teacher's Quests tab for one SIS class.
 *
 * Assign existing quests (the school's own or the Optio library) or create a new
 * quest with preset "template" tasks that every enrolled student receives when
 * they start it. Preset tasks are editable only on the school's own quests.
 * Talks to /api/sis/classes/:classId/quests* (moderator-gated backend).
 *
 * Each quest also carries, per class: a due date, a release date (students see
 * nothing until then; `scheduledEnabled` gates the control by org flag), and
 * who it is for -- everyone, or a picked set of students (Gryffin, 2026-09-10:
 * "some kids can only handle so many assignments" / "only assign certain
 * assignments to specific kids").
 */

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

// Preset-task editing moved to PresetTaskManager (shared with the admin
// curriculum page, 2026-08-31); this file passes it the class-scoped base URL.

// The three tiers assignable-quests returns, in the order it returns them.
const SCOPE_HEADING = {
  curriculum: 'On this class’s curriculum',
  mine: 'Quests you wrote',
  other: 'Elsewhere in your school and the Optio library',
}

export default function ClassQuestsManager({ classId, scheduledEnabled = false }) {
  const confirm = useConfirm()
  const [quests, setQuests] = useState([])
  // The class's active students, for the "who is this for" picker. Rides along
  // on the quests read, so the picker costs no second request.
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  // Assign panel state
  const [mode, setMode] = useState(null) // null | 'existing' | 'new'
  const [search, setSearch] = useState('')
  const [available, setAvailable] = useState([])
  // How many quests exist that this list is deliberately not showing — the rest
  // of the school and the Optio library. Named, so a short list reads as
  // "narrowed" and not as "there is nothing else" (49ba6e08).
  const [hiddenCount, setHiddenCount] = useState(0)
  const [searching, setSearching] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newTasks, setNewTasks] = useState([blankTask()])
  const [creating, setCreating] = useState(false)
  // Curriculum attached to this class, each with its saved quest set.
  const [curricula, setCurricula] = useState([])
  const [syncing, setSyncing] = useState(null) // curriculum id mid-copy/save
  // Optional release date for the NEXT assignment, shared by "assign existing"
  // and "create new". It has to be set at assign time: assigning enrolls the
  // class on the spot, so a date added a minute later would find the quest
  // already in every student's account (Gryffin, 2026-09-10: "put all of the
  // assignments in and then schedule a release date in addition to a due date").
  const [assignRelease, setAssignRelease] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [q, c] = await Promise.all([
        api.get(`/api/sis/classes/${classId}/quests`),
        // Never fatal: a class with no curriculum attached simply has nothing
        // to inherit, and that must not break the quest list.
        api.get(`/api/sis/classes/${classId}/curriculum-quests`).catch(() => ({ data: {} })),
      ])
      setQuests(q.data?.quests || [])
      setStudents(q.data?.students || [])
      setCurricula(c.data?.curricula || [])
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not load class quests')
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => { load() }, [load])

  const loadAvailable = useCallback(async (q) => {
    setSearching(true)
    try {
      const { data } = await api.get(`/api/sis/classes/${classId}/assignable-quests`, { params: { search: q } })
      setAvailable(data?.quests || [])
      setHiddenCount(data?.hidden_count || 0)
    } catch {
      setAvailable([])
      setHiddenCount(0)
    } finally {
      setSearching(false)
    }
  }, [classId])

  useEffect(() => {
    if (mode !== 'existing') return
    const t = setTimeout(() => loadAvailable(search), 250)
    return () => clearTimeout(t)
  }, [mode, search, loadAvailable])

  // Seed this section from a curriculum's saved set. Additive — quests already
  // here keep their dates.
  const copyFromCurriculum = async (c) => {
    setSyncing(c.curriculum_id)
    try {
      const { data } = await api.post(`/api/sis/classes/${classId}/quests/from-curriculum`,
        { curriculum_id: c.curriculum_id })
      const n = data?.added || 0
      toast.success(n ? `Added ${n} quest${n === 1 ? '' : 's'} from ${c.title}`
        : 'Everything from that curriculum is already on this class')
      if (data?.skipped_unavailable) {
        toast(`${data.skipped_unavailable} saved quest${data.skipped_unavailable === 1 ? ' is' : 's are'} no longer available`)
      }
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not add the curriculum quests')
    } finally {
      setSyncing(null)
    }
  }

  // Save this section's list back, so next year's section starts from it.
  const saveToCurriculum = async (c) => {
    if (!(await confirm(
      `Save this class's ${quests.length} quest${quests.length === 1 ? '' : 's'} to "${c.title}"?\n\n`
      + 'This replaces the curriculum\'s saved set. Classes that already copied from it keep what they have — '
      + 'the change applies next time a class is set up from this curriculum.'
    ))) return
    setSyncing(c.curriculum_id)
    try {
      const { data } = await api.post(`/api/sis/classes/${classId}/quests/to-curriculum`,
        { curriculum_id: c.curriculum_id })
      toast.success(`Saved ${data?.saved ?? 0} quest${data?.saved === 1 ? '' : 's'} to ${c.title}`)
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save to the curriculum')
    } finally {
      setSyncing(null)
    }
  }

  // A release date is the START of the day the teacher typed, in their own
  // timezone -- students see it when they sit down that morning. (Due dates
  // use the END of the day, below, for the mirror-image reason.)
  const releaseInputToIso = (value) => {
    if (!value) return null
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d, 0, 0, 0).toISOString()
  }
  const releaseBody = () => {
    const iso = scheduledEnabled ? releaseInputToIso(assignRelease) : null
    return iso ? { publish_at: iso } : {}
  }
  const assignedToast = (verb) => {
    const iso = releaseBody().publish_at
    toast.success(iso
      ? `${verb}. Students will see it on ${new Date(iso).toLocaleDateString()}.`
      : verb)
  }

  const assignExisting = async (questId) => {
    try {
      await api.post(`/api/sis/classes/${classId}/quests`, { quest_id: questId, ...releaseBody() })
      assignedToast('Quest assigned')
      setMode(null); setSearch(''); setAssignRelease('')
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not assign the quest')
    }
  }

  const createNew = async () => {
    if (!newTitle.trim()) { toast.error('Give the quest a title'); return }
    setCreating(true)
    try {
      const tasks = newTasks.filter((t) => t.title.trim())
      await api.post(`/api/sis/classes/${classId}/quests/create`, {
        title: newTitle.trim(), description: newDesc.trim(), tasks, ...releaseBody(),
      })
      assignedToast('Quest created and assigned')
      setMode(null); setNewTitle(''); setNewDesc(''); setNewTasks([blankTask()]); setAssignRelease('')
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not create the quest')
    } finally {
      setCreating(false)
    }
  }

  // Two different things, kept visibly apart: unassign takes the quest off this
  // Due dates live on class_quests, so they are per-class: the same quest can be
  // due on different days for two sections. The column and the student-facing
  // badges existed already; nothing could write it from here (Gryffin,
  // 2026-08-27: "How do we add due dates to any tasks that we assign?").
  const [dueEditing, setDueEditing] = useState(null)
  const [dueValue, setDueValue] = useState('')

  // A date input hands back 'YYYY-MM-DD'. new Date('YYYY-MM-DD') is UTC
  // midnight, and toLocaleDateString() renders that as the day BEFORE anywhere
  // west of Greenwich: Gryffin typed Sep 5 and saw Sep 4 (2026-08-29, both
  // teachers). Store the end of that day in the teacher's own timezone, so
  // every surface that formats the instant locally lands on the day typed.
  const dateInputToIso = (value) => {
    if (!value) return null
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d, 23, 59, 59).toISOString()
  }
  const isoToDateInput = (iso) => {
    if (!iso) return ''
    const dt = new Date(iso)
    if (Number.isNaN(dt.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
  }

  const saveDue = async (questId, value) => {
    const iso = dateInputToIso(value)
    try {
      await api.patch(`/api/sis/classes/${classId}/quests/${questId}`, { due_date: iso })
      setQuests((prev) => prev.map((q) => (q.quest_id === questId ? { ...q, due_date: iso } : q)))
      setDueEditing(null)
      toast.success(value ? 'Due date set' : 'Due date cleared')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the due date')
    }
  }

  // Release date on a quest that is already on the class. The backend moves
  // enrollment with it: a date in the future takes the quest back out of the
  // accounts of students who have not touched it; clearing (or a past date)
  // hands it to everyone it is for today.
  const [releaseEditing, setReleaseEditing] = useState(null)
  const [releaseValue, setReleaseValue] = useState('')
  const isFuture = (iso) => Boolean(iso) && new Date(iso).getTime() > Date.now()

  const saveRelease = async (questId, value) => {
    const iso = releaseInputToIso(value)
    try {
      const { data } = await api.patch(`/api/sis/classes/${classId}/quests/${questId}`, { publish_at: iso })
      setQuests((prev) => prev.map((q) => (q.quest_id === questId ? { ...q, publish_at: iso } : q)))
      setReleaseEditing(null)
      if (isFuture(iso)) {
        const hidden = data?.students_hidden || 0
        toast.success(`Students will see it on ${new Date(iso).toLocaleDateString()}.`
          + (hidden ? ` Hidden from ${hidden} who had not started it.` : ''))
      } else {
        toast.success('Released to students')
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the release date')
    }
  }

  // Who a quest is for. null = everyone on the class (and anyone who joins);
  // a list = those students only. Saved as a whole list; the backend enrolls
  // the newly added and takes the quest back from the newly removed, keeping
  // any work they had already done.
  const [audienceEditing, setAudienceEditing] = useState(null)
  const [audienceDraft, setAudienceDraft] = useState([])
  const [savingAudience, setSavingAudience] = useState(false)
  const rosterIds = students.map((s) => s.student_id)

  const openAudience = (q) => {
    setAudienceDraft(q.student_ids === null || q.student_ids === undefined ? rosterIds : q.student_ids)
    setAudienceEditing(q.quest_id)
  }
  const toggleStudent = (id) => setAudienceDraft((prev) => (
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const audienceLabel = (q) => {
    if (q.student_ids === null || q.student_ids === undefined) return `Everyone (${students.length})`
    return `${q.student_ids.length} of ${students.length} students`
  }

  const saveAudience = async (q) => {
    const everyone = rosterIds.every((id) => audienceDraft.includes(id))
    setSavingAudience(true)
    try {
      const { data } = await api.put(`/api/sis/classes/${classId}/quests/${q.quest_id}/students`,
        { student_ids: everyone ? null : audienceDraft })
      setQuests((prev) => prev.map((x) => (
        x.quest_id === q.quest_id ? { ...x, student_ids: data?.student_ids ?? null } : x)))
      setAudienceEditing(null)
      toast.success(data?.summary || 'Saved who this quest is for')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save who this quest is for')
    } finally {
      setSavingAudience(false)
    }
  }

  // The finish line for the whole quest (quests.xp_threshold), which
  // POST /api/quests/<id>/end already enforces and the student's quest page now
  // reads back as "X of N XP". Teachers asked four times in a week and kept
  // reaching for a preset task's XP box, which is a per-task number (iCreate,
  // 2026-09-01/03: "I can update the required XP for this quest, but I can't
  // save it"; "there is no way to save the XP. It was originally 100, but I
  // need to change it to 50"). Saved on blur, like the training page's.
  const saveXp = async (q, raw) => {
    const next = raw === '' ? 0 : Number(raw)
    if (Number.isNaN(next) || next < 0) { toast.error('XP to finish must be a number'); return }
    if (next === (q.xp_threshold || 0)) return
    try {
      await api.patch(`/api/sis/classes/${classId}/quests/${q.quest_id}`, { xp_threshold: next })
      setQuests((prev) => prev.map((x) => (
        x.quest_id === q.quest_id ? { ...x, xp_threshold: next } : x)))
      toast.success(next ? `Students need ${next} XP to finish this quest` : 'No XP requirement')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the XP')
    }
  }

  // class and leaves it in the school's library; delete removes it entirely.
  const unassign = async (q) => {
    if (!(await confirm(
      `Take "${q.title}" off this class?\n\nThe quest stays in your school's library and you can assign it again later.`))) return
    try {
      await api.delete(`/api/sis/classes/${classId}/quests/${q.quest_id}`)
      setQuests((prev) => prev.filter((x) => x.quest_id !== q.quest_id))
      toast.success('Removed from this class')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove the quest')
    }
  }

  const destroy = async (q) => {
    if (!(await confirm(
      `Delete "${q.title}" for good?\n\nThis removes it from your school's library, not just this class. It can't be undone.`))) return
    try {
      await api.delete(`/api/sis/classes/${classId}/quests/${q.quest_id}/delete`)
      setQuests((prev) => prev.filter((x) => x.quest_id !== q.quest_id))
      toast.success('Quest deleted')
    } catch (err) {
      // 409 = students have started it. The message explains what to do instead.
      toast.error(err?.response?.data?.error || 'Could not delete the quest')
    }
  }

  // Same delete, reached from the assign picker — for a quest that isn't on any
  // class (a teacher's abandoned draft from last year, iCreate 2026-07-30).
  const destroyUnassigned = async (q) => {
    if (!(await confirm(
      `Delete "${q.title}" for good?\n\nThis removes it from your school's library. It can't be undone.`))) return
    try {
      await api.delete(`/api/sis/classes/${classId}/quests/${q.quest_id}/delete`)
      setAvailable((prev) => prev.filter((x) => x.quest_id !== q.quest_id))
      toast.success('Quest deleted')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not delete the quest')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Quests you assign land in each student’s account like any other quest, preset tasks included.
          Each one can have a due date{scheduledEnabled ? ', a release date' : ''} and its own set of students.
        </p>
        {!mode && (
          <button onClick={() => setMode('existing')}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold">
            <PlusIcon className="w-4 h-4" /> Assign a quest
          </button>
        )}
      </div>

      {/* The curriculum round trip. Only rendered when a curriculum is actually
          attached — the point is to make the reusable set obvious where the
          teacher is already working, not to add a permanent empty panel. */}
      {curricula.map((c) => (
        <div key={c.curriculum_id}
          className="rounded-xl border border-optio-purple/20 bg-optio-purple/5 p-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <AcademicCapIcon className="w-5 h-5 text-optio-purple shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 truncate">{c.title}</p>
            <p className="text-xs text-neutral-500">
              {c.quests.length === 0
                ? 'No quests saved to this curriculum yet — save this class\u2019s list to reuse it next year.'
                : c.missing_count > 0
                  ? `${c.missing_count} of ${c.quests.length} saved quest${c.quests.length === 1 ? '' : 's'} not on this class yet`
                  : `All ${c.quests.length} saved quest${c.quests.length === 1 ? '' : 's'} are on this class`}
            </p>
          </div>
          {c.missing_count > 0 && (
            <button type="button" disabled={syncing === c.curriculum_id}
              onClick={() => copyFromCurriculum(c)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-optio-purple/40 text-sm font-medium text-optio-purple hover:bg-optio-purple/10 disabled:opacity-50">
              {syncing === c.curriculum_id ? 'Adding\u2026' : `Add ${c.missing_count} to this class`}
            </button>
          )}
          {quests.length > 0 && (
            <button type="button" disabled={syncing === c.curriculum_id}
              onClick={() => saveToCurriculum(c)}
              title="Replaces the curriculum's saved set with this class's quests"
              className="shrink-0 text-sm font-medium text-optio-purple hover:underline disabled:opacity-50">
              {syncing === c.curriculum_id ? '\u2026' : 'Save this class\u2019s quests to the curriculum'}
            </button>
          )}
        </div>
      ))}

      {/* Assign panel */}
      {mode && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex gap-1 border-b border-gray-200 mb-4">
            {[['existing', 'Assign existing'], ['new', 'Create new']].map(([k, label]) => (
              <button key={k} onClick={() => setMode(k)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                  mode === k ? 'border-optio-purple text-optio-purple' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>
                {label}
              </button>
            ))}
            <button onClick={() => setMode(null)} className="ml-auto text-sm text-neutral-400 hover:text-neutral-700">Cancel</button>
          </div>

          {/* Set before assigning, on purpose: see assignRelease. */}
          {scheduledEnabled && (
            <label className="flex flex-wrap items-center gap-2 mb-4 text-sm text-neutral-700">
              <ClockIcon className="w-4 h-4 text-neutral-400" />
              Release on
              <input type="date" value={assignRelease} onChange={(e) => setAssignRelease(e.target.value)}
                aria-label="Release date for the quest you assign"
                className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
              <span className="text-xs text-neutral-400">
                {assignRelease
                  ? 'Students will not see the quest until that day. You will.'
                  : 'Optional. Leave blank and students see it as soon as you assign it.'}
              </span>
            </label>
          )}

          {mode === 'existing' && (
            <div>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search quests to assign…" className={`${inputCls} mb-3`} />
              {searching && <p className="text-sm text-neutral-400">Searching…</p>}
              {!searching && available.length === 0 && (
                <p className="text-sm text-neutral-500">
                  {search
                    ? 'No quests match that. Try “Create new” instead.'
                    : 'Nothing on this class’s curriculum yet, and you haven’t written any. '
                      + 'Search to pull one from your school or the Optio library, or use “Create new”.'}
                </p>
              )}
              <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {available.map((q, i) => (
                  <React.Fragment key={q.quest_id}>
                  {/* A heading each time the tier changes. The server returns
                      them in order (curriculum, then yours, then the rest), so
                      "which of these am I supposed to be teaching" is answered
                      by where a quest sits rather than by reading 183 titles. */}
                  {q.scope !== available[i - 1]?.scope && (
                    <li className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      {SCOPE_HEADING[q.scope] || 'Other quests'}
                    </li>
                  )}
                  <li className="py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800 truncate">{q.title}</p>
                      <p className="text-xs text-neutral-400">
                        {q.source === 'organization' ? 'Your school' : 'Optio library'}
                        {q.template_task_count ? ` · ${q.template_task_count} preset task${q.template_task_count === 1 ? '' : 's'}` : ' · no preset tasks'}
                      </p>
                    </div>
                    {/* A quest created by mistake and never assigned had no way
                        out: delete only existed on assigned quests. It's the
                        school's own quest, so it can be deleted from here too
                        (the API still refuses if a student has started it). */}
                    {q.source === 'organization' && (
                      <button onClick={() => destroyUnassigned(q)}
                        className="shrink-0 text-sm text-neutral-400 hover:text-red-500 hover:underline"
                        title="Delete it from your school's library for good">
                        Delete
                      </button>
                    )}
                    <button onClick={() => assignExisting(q.quest_id)}
                      className="shrink-0 px-3 py-1.5 rounded-lg border border-optio-purple/40 text-optio-purple text-sm font-semibold hover:bg-optio-purple/5">
                      Assign
                    </button>
                  </li>
                  </React.Fragment>
                ))}
              </ul>
              {hiddenCount > 0 && (
                <p className="mt-2 text-xs text-neutral-400">
                  {hiddenCount} more quest{hiddenCount === 1 ? '' : 's'} in your school and the
                  Optio library — search above to find {hiddenCount === 1 ? 'it' : 'them'}.
                </p>
              )}
            </div>
          )}

          {mode === 'new' && (
            <div className="space-y-3">
              {/* Teachers get the same AI head start admins get in the
                  curriculum library — this is the screen where most quests are
                  actually written. */}
              <QuestAiDraftPanel
                hasDraft={Boolean(newTitle.trim() || newDesc.trim() || newTasks.some((t) => t.title.trim()))}
                onDrafted={({ title, description, tasks }) => {
                  setNewTitle(title); setNewDesc(description); setNewTasks(tasks)
                }}
              />
              <QuestDraftForm
                title={newTitle} setTitle={setNewTitle}
                description={newDesc} setDescription={setNewDesc}
                tasks={newTasks} setTasks={setNewTasks}
                titlePlaceholder="Quest title (e.g. Watercolor Basics)"
                descriptionPlaceholder="What is this quest about? (optional)"
                taskHint="Preset tasks are copied to each student when they start the quest. Leave it empty and they write their own. Every task needs evidence — a photo, a note or a link — before a student can mark it done."
              />
              <div className="flex justify-end">
                <button onClick={createNew} disabled={creating || !newTitle.trim()}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create & assign'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assigned quests */}
      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : quests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <AcademicCapIcon className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
          <p className="text-sm text-neutral-500">No quests assigned yet. Assign one to give your class something to work on.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {quests.map((q) => {
            const open = expanded === q.quest_id
            return (
              <li key={q.quest_id} className="bg-white rounded-xl border border-gray-200">
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => setExpanded(open ? null : q.quest_id)}
                    className="shrink-0 text-neutral-400 hover:text-neutral-700" aria-label="Toggle tasks">
                    {open ? <ChevronDownIcon className="w-5 h-5" /> : <ChevronRightIcon className="w-5 h-5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{q.title}</p>
                    <p className="text-xs text-neutral-400">
                      {q.template_task_count
                        ? `${q.template_task_count} preset task${q.template_task_count === 1 ? '' : 's'}`
                        : 'No preset tasks'}
                      {!q.editable_tasks ? ' · Optio library' : ''}
                      {q.xp_threshold ? ` · ${q.xp_threshold} XP to finish` : ''}
                    </p>
                    {/* Deliberately here and not in the task rows: this is the
                        whole quest's target, and a box sitting among the tasks
                        is the one teachers kept typing into by mistake. A
                        library quest belongs to every school, so its target is
                        not ours to set. */}
                    <button type="button" onClick={() => (audienceEditing === q.quest_id ? setAudienceEditing(null) : openAudience(q))}
                      aria-expanded={audienceEditing === q.quest_id}
                      title="Choose which students get this quest"
                      className={`mt-1 inline-flex items-center gap-1 text-xs rounded px-1.5 py-0.5 hover:bg-optio-purple/10 ${
                        q.student_ids === null || q.student_ids === undefined
                          ? 'text-neutral-500' : 'text-optio-purple font-medium bg-optio-purple/5'}`}>
                      <UsersIcon className="w-3.5 h-3.5" /> {audienceLabel(q)}
                    </button>
                    {q.editable_tasks && (
                      <label className="flex items-center gap-2 text-xs text-neutral-500 mt-1.5">
                        XP to finish
                        <input type="number" min={0} step={25} defaultValue={q.xp_threshold || ''}
                          onBlur={(e) => saveXp(q, e.target.value)}
                          placeholder="Any"
                          aria-label={`XP to finish ${q.title}`}
                          title="Leave blank and any amount of work finishes the quest"
                          className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs" />
                      </label>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {scheduledEnabled && isFuture(q.publish_at) && releaseEditing !== q.quest_id && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-sky-100 text-sky-700 whitespace-nowrap"
                        title="Students cannot see this quest yet">
                        Releases {new Date(q.publish_at).toLocaleDateString()}
                      </span>
                    )}
                    {scheduledEnabled && (releaseEditing === q.quest_id ? (
                      <div className="flex items-center gap-1.5">
                        <input type="date" value={releaseValue} autoFocus
                          onChange={(e) => setReleaseValue(e.target.value)}
                          aria-label={`Release date for ${q.title}`}
                          title="Students see the quest from this day. Until then only you and other staff do."
                          className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                        <button onClick={() => saveRelease(q.quest_id, releaseValue)} disabled={!releaseValue}
                          className="px-2 py-1 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-xs disabled:opacity-40">
                          Save
                        </button>
                        {isFuture(q.publish_at) && (
                          <button onClick={() => saveRelease(q.quest_id, '')}
                            className="px-2 py-1 rounded-lg border border-gray-300 text-xs text-neutral-600">
                            Release now
                          </button>
                        )}
                        <button onClick={() => setReleaseEditing(null)}
                          className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setReleaseValue(isoToDateInput(isFuture(q.publish_at) ? q.publish_at : null))
                          setReleaseEditing(q.quest_id)
                        }}
                        className="px-2 py-1 flex items-center gap-1 text-xs text-neutral-500 hover:text-sky-700 hover:bg-sky-50 rounded-lg whitespace-nowrap">
                        <ClockIcon className="w-4 h-4" />
                        {isFuture(q.publish_at) ? 'Change release date' : 'Set release date'}
                      </button>
                    ))}
                    {q.due_date && dueEditing !== q.quest_id && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap">
                        Due {new Date(q.due_date).toLocaleDateString()}
                      </span>
                    )}
                    {dueEditing === q.quest_id ? (
                      <div className="flex items-center gap-1.5">
                        <input type="date" value={dueValue} autoFocus
                          onChange={(e) => setDueValue(e.target.value)}
                          // "What happens after the due date? Does it lock?"
                          // (625d1958, 2026-09-01). It does not, on purpose —
                          // the answer belongs next to the field, not in a
                          // support reply a year from now.
                          title="Nothing locks after this date. It marks the quest overdue on your progress view and in reminders; students can still finish it."
                          className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                        <button onClick={() => saveDue(q.quest_id, dueValue)}
                          className="px-2 py-1 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-xs">
                          Save
                        </button>
                        {q.due_date && (
                          <button onClick={() => saveDue(q.quest_id, '')}
                            className="px-2 py-1 rounded-lg border border-gray-300 text-xs text-neutral-600">
                            Clear
                          </button>
                        )}
                        <button onClick={() => setDueEditing(null)}
                          className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700">
                          Cancel
                        </button>
                        <span className="text-xs text-neutral-400">
                          Marks it overdue — doesn’t lock it.
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setDueValue(isoToDateInput(q.due_date))
                          setDueEditing(q.quest_id)
                        }}
                        className="px-2 py-1 flex items-center gap-1 text-xs text-neutral-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg whitespace-nowrap">
                        <CalendarDaysIcon className="w-4 h-4" />
                        {q.due_date ? 'Change due date' : 'Set due date'}
                      </button>
                    )}
                    <button onClick={() => unassign(q)}
                      title="Take it off this class — the quest stays in your library"
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-neutral-600 text-sm font-medium hover:bg-gray-50">
                      Unassign
                    </button>
                    {/* Only the school's own quests can be deleted; library
                        quests are shared with other schools. */}
                    {q.editable_tasks && (
                      <button onClick={() => destroy(q)}
                        title="Delete it from your school's library for good"
                        className="p-1.5 text-gray-400 hover:text-red-500"
                        aria-label={`Delete ${q.title}`}>
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                {audienceEditing === q.quest_id && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/70" role="group"
                    aria-label={`Who gets ${q.title}`}>
                    <p className="text-xs text-neutral-600 mb-2">
                      Who gets this quest? Uncheck a student to take it off their list.
                      Anything they have already done stays in their account.
                    </p>
                    {students.length === 0 ? (
                      <p className="text-xs text-neutral-400">No students are enrolled in this class yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {students.map((s) => (
                          <label key={s.student_id} className="inline-flex items-center gap-1.5 text-sm text-neutral-800">
                            <input type="checkbox" checked={audienceDraft.includes(s.student_id)}
                              onChange={() => toggleStudent(s.student_id)}
                              className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                            {s.name}
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setAudienceDraft(rosterIds)}
                        className="text-xs text-optio-purple hover:underline">Everyone</button>
                      <button type="button" onClick={() => setAudienceDraft([])}
                        className="text-xs text-neutral-500 hover:underline">Nobody</button>
                      <button type="button" onClick={() => saveAudience(q)}
                        disabled={savingAudience || audienceDraft.length === 0}
                        title={audienceDraft.length === 0 ? 'Pick at least one student, or unassign the quest instead' : undefined}
                        className="ml-2 px-3 py-1 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-xs font-semibold disabled:opacity-40">
                        {savingAudience ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" onClick={() => setAudienceEditing(null)}
                        className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700">Cancel</button>
                      <span className="text-xs text-neutral-400">
                        New students automatically get quests assigned to everyone. A quest kept to
                        specific students stays with them until you add someone here.
                      </span>
                    </div>
                  </div>
                )}
                {open && (
                  <div className="border-t border-gray-100 px-4 pb-4">
                    <PresetTaskManager base={`/api/sis/classes/${classId}/quests/${q.quest_id}/tasks`}
                      questId={q.quest_id} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
