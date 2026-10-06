import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  PlusIcon, AcademicCapIcon, ChevronDownIcon, ChevronRightIcon,
  ClockIcon, UsersIcon, EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import QuestEditor from './QuestEditor'
import { StudentWorkPanel } from './StudentProgressTab'
import QuestDraftsList from './questEditor/QuestDraftsList'
import { useConfirm } from '../../contexts/ConfirmContext'
import { useRefreshAfterQuestEdit } from '../../hooks/api/useQuestEditor'
import { INPUT_CLASS, INLINE_INPUT_CLASS } from '../ui/Input'
import PopMenu from './ui/PopMenu'
import CurriculumCard from './classQuests/CurriculumCard'
import { groupByCurriculum } from './classQuests/groupByCurriculum'
import { REPLACE_COPY } from './classQuests/replaceOriginal'

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
 *
 * Making and editing a quest is QuestEditor, the one quest form every SIS
 * screen shares since P6 (2026-09-23). "Create new" starts a draft on this
 * class; Publish puts it on the class with its dates and audience. A teacher
 * edits only the quests they wrote (`can_edit` from the server); on anybody
 * else's the editor is read-only with this class's settings still theirs.
 */

const inputCls = INPUT_CLASS
const firstName = (name) => (name || '').split(' ')[0] || 'the student'

// One labelled setting in a quest row's panel, its helper text under it.
function QuestField({ label, hint, groupLabel, className = '', children }) {
  return (
    <div role="group" aria-label={groupLabel || label} className={className}>
      <p className="block text-sm font-medium text-gray-700">{label}</p>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

// The three tiers assignable-quests returns, in the order it returns them.
const SCOPE_HEADING = {
  curriculum: 'On this class’s curriculum',
  mine: 'Quests you wrote',
  other: 'Elsewhere in your school and the Optio library',
}

export default function ClassQuestsManager({ classId, orgId = null, scheduledEnabled = false, canSaveToCurriculum = false }) {
  const confirm = useConfirm()
  const [quests, setQuests] = useState([])
  // The class's active students, for the "who is this for" picker. Rides along
  // on the quests read, so the picker costs no second request.
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  // Which row's ⋯ menu (Unassign, Delete) is open.
  const [menuFor, setMenuFor] = useState(null)

  // Assign panel state
  const [mode, setMode] = useState(null) // null | 'existing'
  // The quest editor: {questId?} -- no questId starts a new draft on this class.
  const [editing, setEditing] = useState(null)
  // A student's own quest opens that student's work, not the editor: it has no
  // school on it, so the editor cannot load it, and it is theirs to change.
  const [workFor, setWorkFor] = useState(null)
  const [search, setSearch] = useState('')
  const [available, setAvailable] = useState([])
  // How many quests exist that this list is deliberately not showing — the rest
  // of the school and the Optio library. Named, so a short list reads as
  // "narrowed" and not as "there is nothing else" (49ba6e08).
  const [hiddenCount, setHiddenCount] = useState(0)
  const [searching, setSearching] = useState(false)
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

  // Seed this section from a curriculum's saved set, for everyone or for the
  // students picked on the card (studentIds null = everyone; 1a630837).
  // Additive — quests already here keep their dates and their students.
  const copyFromCurriculum = async (c, studentIds = null) => {
    setSyncing(c.curriculum_id)
    try {
      const body = { curriculum_id: c.curriculum_id }
      if (Array.isArray(studentIds)) body.student_ids = studentIds
      const { data } = await api.post(`/api/sis/classes/${classId}/quests/from-curriculum`, body)
      const n = data?.added || 0
      const w = data?.widened || 0
      toast.success(n || w
        ? [n ? `Added ${n} quest${n === 1 ? '' : 's'} from ${c.title}` : '',
          w ? `gave ${w} more to the students you picked` : ''].filter(Boolean).join('; ')
        : 'Everything from that curriculum is already on this class for them')
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

  const refreshDrafts = useRefreshAfterQuestEdit(orgId)

  // Two different things, kept visibly apart: unassign takes the quest off this
  // Due dates live on class_quests, so they are per-class: the same quest can be
  // due on different days for two sections. The column and the student-facing
  // badges existed already; nothing could write it from here (Gryffin,
  // 2026-08-27: "How do we add due dates to any tasks that we assign?").
  //
  // The row's settings panel shows every field at once, so a typed-but-unsaved
  // date is a draft held per quest; with no draft the field shows what is saved.
  const [dueDrafts, setDueDrafts] = useState({})
  const [releaseDrafts, setReleaseDrafts] = useState({})
  const dropDraft = (setter, questId) => setter((prev) => {
    const next = { ...prev }
    delete next[questId]
    return next
  })

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
      dropDraft(setDueDrafts, questId)
      toast.success(value ? 'Due date set' : 'Due date cleared')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the due date')
    }
  }

  // Release date on a quest that is already on the class. The backend moves
  // enrollment with it: a date in the future takes the quest back out of the
  // accounts of students who have not touched it; clearing (or a past date)
  // hands it to everyone it is for today.
  const isFuture = (iso) => Boolean(iso) && new Date(iso).getTime() > Date.now()

  const saveRelease = async (questId, value) => {
    const iso = releaseInputToIso(value)
    try {
      const { data } = await api.patch(`/api/sis/classes/${classId}/quests/${questId}`, { publish_at: iso })
      setQuests((prev) => prev.map((q) => (q.quest_id === questId ? { ...q, publish_at: iso } : q)))
      dropDraft(setReleaseDrafts, questId)
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
  // The checklist sits open in the row's panel; an unsaved change is a draft
  // per quest, and Cancel drops it back to what is saved.
  const [audienceDrafts, setAudienceDrafts] = useState({})
  const [savingAudience, setSavingAudience] = useState(false)
  const rosterIds = students.map((s) => s.student_id)

  const savedAudience = (q) => (q.student_ids === null || q.student_ids === undefined ? rosterIds : q.student_ids)
  const audienceFor = (q) => audienceDrafts[q.quest_id] ?? savedAudience(q)
  const setAudienceDraft = (q, ids) => setAudienceDrafts((prev) => ({ ...prev, [q.quest_id]: ids }))
  const toggleStudent = (q, id) => {
    const cur = audienceFor(q)
    setAudienceDraft(q, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  }
  const audienceLabel = (q) => {
    if (q.made_by) return `Only ${q.made_by_name}`
    if (q.student_ids === null || q.student_ids === undefined) return `Everyone (${students.length})`
    return `${q.student_ids.length} of ${students.length} students`
  }

  const saveAudience = async (q) => {
    const audienceDraft = audienceFor(q)
    const everyone = rosterIds.every((id) => audienceDraft.includes(id))
    setSavingAudience(true)
    try {
      const { data } = await api.put(`/api/sis/classes/${classId}/quests/${q.quest_id}/students`,
        { student_ids: everyone ? null : audienceDraft })
      setQuests((prev) => prev.map((x) => (
        x.quest_id === q.quest_id ? { ...x, student_ids: data?.student_ids ?? null } : x)))
      dropDraft(setAudienceDrafts, q.quest_id)
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

  // A copy the teacher wrote, so they may change it. iCreate, 2026-10-01:
  // teachers wanted to edit an office quest "and save it as their own"
  // (167ba6df), and to "copy a current quest, so I can repeat the assignment
  // for the next week" (60ffe195). The copy starts as a draft for this class
  // (owner, 2026-10-02): no student gets it until the teacher presses
  // "Publish to class" in the editor, which opens on it straight away, since
  // changing it is why it was made. It waits in this class's Drafts until then.
  const [copying, setCopying] = useState(null)
  const copyQuest = async (q) => {
    if (!(await confirm(
      `Make your own copy of "${q.title}"?\n\n`
      + 'The copy is yours to change. It starts as a draft: students get it only when you publish it. '
      + 'The original stays on the class as it is. When you publish the copy, you can have it replace the original on this class.'
    ))) return
    setCopying(q.quest_id)
    try {
      const { data } = await api.post(`/api/sis/classes/${classId}/quests/${q.quest_id}/duplicate`, {})
      refreshDrafts()
      toast.success(`Copied as a draft: "${data?.title}"`)
      setEditing({ questId: data?.quest_id })
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not copy the quest')
    } finally {
      setCopying(null)
    }
  }

  // The teacher's copy takes its original's place on THIS class (987218e0).
  // The copy had gone on the class beside the original, so students got both.
  const replaceOriginal = async (q) => {
    const original = quests.find((x) => x.quest_id === q.replaces_quest_id)
    if (!(await confirm(
      `Replace "${original?.title || 'the original'}" with "${q.title}" on this class?\n\n${REPLACE_COPY}`))) return
    try {
      const { data } = await api.post(`/api/sis/classes/${classId}/quests/${q.quest_id}/replace-original`, {})
      toast.success(data?.summary || 'Replaced the original on this class')
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not replace the original')
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
        <div className="shrink-0 flex items-center gap-2">
          {!mode && (
            <button onClick={() => setMode('existing')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-optio-purple/40 text-optio-purple text-sm font-semibold hover:bg-optio-purple/5">
              <PlusIcon className="w-4 h-4" /> Assign a quest
            </button>
          )}
          <button onClick={() => setEditing({})} disabled={!!editing}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
            <PlusIcon className="w-4 h-4" /> Create new
          </button>
        </div>
      </div>

      <QuestDraftsList orgId={orgId} context="class" classId={classId}
        onResume={(d) => setEditing({ questId: d.id })} />

      {editing && (
        <QuestEditor key={editing.questId || 'new'} context="class" orgId={orgId} classId={classId}
          questId={editing.questId || null}
          classLink={editing.link || null} students={students} scheduledEnabled={scheduledEnabled}
          classQuests={quests}
          onMakeCopy={editing.link && !editing.link.can_edit && !editing.link.made_by
            ? () => { const src = editing.link; setEditing(null); copyQuest(src) } : null}
          onDone={() => { refreshDrafts(); load() }}
          onClose={() => setEditing(null)} />
      )}

      {workFor && (
        <StudentWorkPanel classId={classId} student={workFor}
          onClose={() => setWorkFor(null)} onChanged={load} />
      )}

      {/* The curriculum round trip. Only rendered when a curriculum is actually
          attached — the point is to make the reusable set obvious where the
          teacher is already working, not to add a permanent empty panel. */}
      {curricula.map((c) => (
        <CurriculumCard key={c.curriculum_id} curriculum={c} students={students}
          busy={syncing === c.curriculum_id} onAdd={copyFromCurriculum}
          canSave={canSaveToCurriculum && quests.length > 0} onSave={saveToCurriculum} />
      ))}

      {/* Assign panel */}
      {mode && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-sm font-semibold text-neutral-900">Assign an existing quest</h3>
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
                    ? 'No quests match that. Try “Create new” above instead.'
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

        </div>
      )}

      {/* Assigned quests. Each row: what the quest is and the actions on it, up
          front; this class's settings for it (who, release, due, XP) in the
          panel the row opens. The owner, 2026-10-02: the header had crammed
          every editor inline and hidden Open quest behind the chevron. */}
      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : quests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <AcademicCapIcon className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
          <p className="text-sm text-neutral-500">No quests assigned yet. Assign one to give your class something to work on.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {groupByCurriculum(quests, curricula).map(({ quest: q, heading }) => {
            const open = expanded === q.quest_id
            const scheduled = scheduledEnabled && isFuture(q.publish_at)
            const dueDraft = dueDrafts[q.quest_id] ?? isoToDateInput(q.due_date)
            const releaseDraft = releaseDrafts[q.quest_id] ?? isoToDateInput(scheduled ? q.publish_at : null)
            const audienceDraft = audienceFor(q)
            const audienceDirty = q.quest_id in audienceDrafts
            const meta = [
              <span key="tasks">
                {q.template_task_count
                  ? `${q.template_task_count} preset task${q.template_task_count === 1 ? '' : 's'}`
                  : 'No preset tasks'}
              </span>,
              q.made_by ? <span key="by">Made by {q.made_by_name}</span>
                : !q.editable_tasks ? <span key="by">Optio library</span> : null,
              <span key="who" className="inline-flex items-center gap-1"
                title={q.made_by ? "A student's own quest stays with the student who made it" : undefined}>
                <UsersIcon className="w-3.5 h-3.5" /> {audienceLabel(q)}
              </span>,
              scheduled ? (
                <span key="rel" title="Students cannot see this quest yet"
                  className="font-medium px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 whitespace-nowrap">
                  Releases {new Date(q.publish_at).toLocaleDateString()}
                </span>
              ) : null,
              q.due_date ? (
                <span key="due" className="font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap">
                  Due {new Date(q.due_date).toLocaleDateString()}
                </span>
              ) : null,
              q.xp_threshold ? <span key="xp">{q.xp_threshold} XP to finish</span> : null,
            ].filter(Boolean)
            return (
              <React.Fragment key={q.quest_id}>
              {/* Grouped under the curriculum each quest came from (1a630837). */}
              {heading && (
                <li className="pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{heading}</li>
              )}
              <li className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
                  <button type="button" onClick={() => setExpanded(open ? null : q.quest_id)}
                    aria-expanded={open}
                    title={open ? 'Hide this class’s settings' : 'Who gets it, dates and XP for this class'}
                    className="flex-1 min-w-[12rem] flex items-start gap-2 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-optio-purple">
                    {open
                      ? <ChevronDownIcon className="w-5 h-5 mt-0.5 shrink-0 text-gray-400" />
                      : <ChevronRightIcon className="w-5 h-5 mt-0.5 shrink-0 text-gray-400" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900 truncate">{q.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-500">
                        {meta.map((m, i) => (
                          <React.Fragment key={m.key}>
                            {i > 0 && <span aria-hidden="true">·</span>}
                            {m}
                          </React.Fragment>
                        ))}
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2 ml-auto">
                    {q.made_by ? (
                      <button type="button" className="btn-quiet px-3 py-1.5"
                        onClick={() => setWorkFor({ student_id: q.made_by, name: q.made_by_name })}>
                        See {firstName(q.made_by_name)}’s work
                      </button>
                    ) : (
                      <>
                        <button type="button" className="btn-quiet px-3 py-1.5"
                          onClick={() => setEditing({ questId: q.quest_id, link: q })}>
                          {q.can_edit ? 'Edit quest' : 'Open quest'}
                        </button>
                        <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => copyQuest(q)}
                          disabled={copying === q.quest_id}>
                          {copying === q.quest_id ? 'Copying…' : q.can_edit ? 'Make a copy' : 'Make my own copy'}
                        </button>
                      </>
                    )}
                    <PopMenu open={menuFor === q.quest_id} onClose={() => setMenuFor(null)} width="w-60"
                      trigger={(
                        <button type="button" aria-label={`More for ${q.title}`} aria-haspopup="menu"
                          aria-expanded={menuFor === q.quest_id}
                          onClick={() => setMenuFor(menuFor === q.quest_id ? null : q.quest_id)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-optio-purple hover:bg-optio-purple/5">
                          <EllipsisHorizontalIcon className="w-5 h-5" />
                        </button>
                      )}>
                      {/* Two different things, kept apart: unassign takes the
                          quest off this class; delete removes it entirely. */}
                      <button type="button" role="menuitem"
                        onClick={() => { setMenuFor(null); unassign(q) }}
                        title="Take it off this class — the quest stays in your library"
                        className="block w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
                        Unassign
                      </button>
                      {q.replaces_quest_id && (
                        <button type="button" role="menuitem"
                          onClick={() => { setMenuFor(null); replaceOriginal(q) }}
                          title={REPLACE_COPY}
                          className="block w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
                          Replace the original on this class
                        </button>
                      )}
                      {/* Only a quest the caller may change can be deleted: the
                          office's, or one this teacher wrote. Library quests are
                          shared with other schools. */}
                      {q.can_edit && (
                        <button type="button" role="menuitem"
                          onClick={() => { setMenuFor(null); destroy(q) }}
                          title="Delete it from your school's library for good"
                          aria-label={`Delete ${q.title}`}
                          className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-neutral-50">
                          Delete
                        </button>
                      )}
                    </PopMenu>
                  </div>
                </div>
                {open && (
                  <div className="border-t border-gray-100 p-4">
                    <p className="text-sm font-semibold uppercase tracking-wider text-optio-purple">This class</p>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                      {scheduledEnabled && (
                        <QuestField label="Release date"
                          hint="Students see the quest from this day. Until then only you and other staff do.">
                          <div className="flex flex-wrap items-center gap-2">
                            <input type="date" value={releaseDraft}
                              onChange={(e) => setReleaseDrafts((prev) => ({ ...prev, [q.quest_id]: e.target.value }))}
                              aria-label={`Release date for ${q.title}`}
                              className={INLINE_INPUT_CLASS} />
                            <button type="button" onClick={() => saveRelease(q.quest_id, releaseDraft)}
                              disabled={!releaseDraft || !(q.quest_id in releaseDrafts)}
                              className="btn-quiet px-3 py-1.5">
                              Save
                            </button>
                            {scheduled && (
                              <button type="button" onClick={() => saveRelease(q.quest_id, '')}
                                className="btn-ghost px-3 py-1.5">
                                Release now
                              </button>
                            )}
                          </div>
                        </QuestField>
                      )}

                      <QuestField label="Due date" hint="Marks it overdue — doesn’t lock it.">
                        <div className="flex flex-wrap items-center gap-2">
                          <input type="date" value={dueDraft}
                            onChange={(e) => setDueDrafts((prev) => ({ ...prev, [q.quest_id]: e.target.value }))}
                            aria-label={`Due date for ${q.title}`}
                            // "What happens after the due date? Does it lock?"
                            // (625d1958, 2026-09-01). It does not, on purpose —
                            // the answer belongs next to the field, not in a
                            // support reply a year from now.
                            title="Nothing locks after this date. It marks the quest overdue on your progress view and in reminders; students can still finish it."
                            className={INLINE_INPUT_CLASS} />
                          <button type="button" onClick={() => saveDue(q.quest_id, dueDraft)}
                            disabled={!(q.quest_id in dueDrafts)}
                            className="btn-quiet px-3 py-1.5">
                            Save
                          </button>
                          {q.due_date && (
                            <button type="button" onClick={() => saveDue(q.quest_id, '')}
                              className="btn-ghost px-3 py-1.5">
                              Clear
                            </button>
                          )}
                        </div>
                      </QuestField>

                      {/* Deliberately here and not in the task rows: this is the
                          whole quest's target, and a box sitting among the tasks
                          is the one teachers kept typing into by mistake. A
                          library quest belongs to every school, so its target is
                          not ours to set. */}
                      {/* The office can lock the finish line from the library
                          (quests.teachers_may_change_xp). Molly, iCreate,
                          3d926fc3: "click on 'teachers may change' if we want
                          teachers to change it." canSaveToCurriculum is the
                          office signal (TeacherClassPage passes useSisOrg().isAdmin);
                          the backend refuses a teacher's write either way. */}
                      {q.editable_tasks && (q.teachers_may_change_xp === false && !canSaveToCurriculum ? (
                        <QuestField label="XP to finish" hint="Set by your school office">
                          <input type="number" value={q.xp_threshold || ''} readOnly disabled
                            placeholder="Any"
                            aria-label={`XP to finish ${q.title}`}
                            className={`w-28 ${INLINE_INPUT_CLASS} bg-neutral-50 text-gray-500`} />
                        </QuestField>
                      ) : (
                        <QuestField label="XP to finish"
                          hint="Leave blank and any amount of work finishes the quest. Saves when you leave the box.">
                          <input type="number" min={0} step={25} defaultValue={q.xp_threshold || ''}
                            onBlur={(e) => saveXp(q, e.target.value)}
                            placeholder="Any"
                            aria-label={`XP to finish ${q.title}`}
                            title="Leave blank and any amount of work finishes the quest"
                            className={`w-28 ${INLINE_INPUT_CLASS}`} />
                        </QuestField>
                      ))}

                      {/* Full width, after the dates: the release and due dates
                          sit side by side in the first row (Tanner, 2026-10-02). */}
                      <QuestField label="Who gets it" groupLabel={`Who gets ${q.title}`} className="md:col-span-2"
                        hint={q.made_by
                          ? 'A student’s own quest stays with the student who made it.'
                          : 'Uncheck a student to take it off their list. Anything they have already done stays in their account. '
                            + 'New students automatically get quests assigned to everyone. A quest kept to specific students '
                            + 'stays with them until you add someone here.'}>
                        {q.made_by ? (
                          <p className="text-sm text-gray-700">Only {q.made_by_name}</p>
                        ) : students.length === 0 ? (
                          <p className="text-xs text-gray-400">No students are enrolled in this class yet.</p>
                        ) : (
                          <>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                              {students.map((s) => (
                                <label key={s.student_id} className="inline-flex items-center gap-1.5 text-sm text-gray-800">
                                  <input type="checkbox" checked={audienceDraft.includes(s.student_id)}
                                    onChange={() => toggleStudent(q, s.student_id)}
                                    className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                                  {s.name}
                                </label>
                              ))}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                              <button type="button" onClick={() => setAudienceDraft(q, rosterIds)}
                                className="text-xs font-medium text-optio-purple hover:underline">Everyone</button>
                              <button type="button" onClick={() => setAudienceDraft(q, [])}
                                className="text-xs font-medium text-gray-500 hover:underline">Nobody</button>
                              <button type="button" onClick={() => saveAudience(q)}
                                disabled={savingAudience || !audienceDirty || audienceDraft.length === 0}
                                title={audienceDraft.length === 0 ? 'Pick at least one student, or unassign the quest instead' : undefined}
                                className="btn-quiet px-3 py-1">
                                {savingAudience ? 'Saving…' : 'Save'}
                              </button>
                              {audienceDirty && (
                                <button type="button" onClick={() => dropDraft(setAudienceDrafts, q.quest_id)}
                                  className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                              )}
                            </div>
                          </>
                        )}
                      </QuestField>
                    </div>

                    {/* Pictures, handouts and videos for the quest as a whole,
                        which students see at the top of the quest. Each task
                        has its own below. "Is there a way to upload images into
                        quests for the kids to look over?" (Gryffin, 2026-09-14,
                        ac9bde84) -- there was, one task at a time. */}
                    {q.description && (
                      <p className="mt-5 text-sm text-gray-600 whitespace-pre-line">{q.description}</p>
                    )}
                    <p className="mt-3 text-xs text-gray-500">
                      {q.made_by
                        ? `${q.made_by_name} made this quest for your class. It is private to them and you.`
                        : q.can_edit
                          ? 'Title, picture, tasks, files and links, and this class’s dates.'
                          : 'Its tasks are read-only to you. Its dates and who it is for on this class are yours. Make your own copy to change it.'}
                    </p>
                  </div>
                )}
              </li>
              </React.Fragment>
            )
          })}
        </ul>
      )}
    </div>
  )
}
