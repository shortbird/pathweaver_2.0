import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { EyeIcon } from '@heroicons/react/24/outline'
import { Modal } from '../ui/Modal'
import Button from '../ui/Button'
import SearchSelect from '../ui/SearchSelect'
import QuestDraftForm, { blankTask, withPillarSubject } from './QuestDraftForm'
import QuestAiDraftPanel from './QuestAiDraftPanel'
import QuestPreviewModal from './QuestPreviewModal'
import HeaderImageField from './questEditor/HeaderImageField'
import MoreOptions from './questEditor/MoreOptions'
import ClassSettingsSection, {
  classSettingsFrom, dueInputToIso, releaseInputToIso,
} from './questEditor/ClassSettingsSection'
import TrainingSettingsFields, {
  blankTrainingSettings, trainingSettingsBody, trainingSettingsFrom,
} from './TrainingSettingsFields'
import { useConfirm } from '../../contexts/ConfirmContext'
import { REPLACE_COPY } from './classQuests/replaceOriginal'
import { questEditorApi } from '../../hooks/api/useQuestEditor'
import { OrganizationContext } from '../../contexts/OrganizationContext'
import { moduleKnownOff } from '../../modules/moduleEnabled'

/**
 * QuestEditor -- the one form for making or editing a quest, everywhere the
 * SIS console does it (owner decision, 2026-09-23; P6 of
 * docs/icreate/TASKS_MESSAGING_QUESTS_PLAN_2026-09-23.md).
 *
 * It replaced four create forms and five editors: the library's NewQuestPanel
 * and QuestEditModal, the class tab's "Create new" and QuestInfoEditor, the
 * curriculum's create form and QuestDetail edit, and TrainingForm's quest
 * fields. Each had a different subset -- only training could upload a header
 * image, only the library could lock the XP to finish, attachments waited for
 * a first save -- and now every screen has all of it.
 *
 * `context` decides three things and nothing else:
 *   - where Publish goes and what it attaches the quest to
 *     (library: optionally a curriculum; class: the class, with its dates and
 *     audience; curriculum: that curriculum and its classes; training: the
 *     catalog row),
 *   - the context section drawn under the quest (curriculum pick; class
 *     dates and audience; training category, required, audience, age, roles,
 *     people),
 *   - small defaults (training hides the per-task subject pickers).
 *
 * A new quest is created the moment the editor opens, as an inactive draft, so
 * its header image, files and each task's attachments work at once. Nobody
 * sees a draft but the people who can edit it. Closing a draft saves it; a
 * draft nobody wrote a word into is removed on close; every other draft stays
 * in its screen's Drafts list until somebody publishes or discards it.
 *
 * Who may change what is the server's answer (`editable`, `can_lock_xp`): the
 * office, or the teacher who wrote the quest. A teacher opening the office's
 * quest from their class sees it read-only with the class section editable.
 */

const ENDPOINT_WORDS = {
  library: 'Publish',
  class: 'Publish to class',
  curriculum: 'Publish to curriculum',
  training: 'Publish',
  student: 'Publish and assign',
}

const taskBody = (t) => ({
  ...(t.id ? { id: t.id } : {}),
  title: t.title.trim(),
  description: t.description || '',
  pillar: t.pillar,
  xp_value: Number(t.xp_value) || 0,
  is_required: !!t.is_required,
  diploma_subjects: t.diploma_subjects || [],
  subject_xp_distribution: t.subject_xp_distribution || {},
})

export default function QuestEditor({
  context, orgId, questId: initialQuestId = null,
  classId = null, curriculumId = null, trainingId: initialTrainingId = null, audience = 'staff',
  // context 'student': the one student a teacher is writing this quest for
  // (the one-student page, 2026-10-07). Publish gives it to them.
  studentId = null,
  classLink = null, students = [], scheduledEnabled = false,
  curricula = [], orgLogo = null,
  // The categories already filed on the training tab, offered as a pick
  // list in the training section (ticket 79e58519).
  trainingCategories = [],
  // Whether anybody is on this quest yet (a class, a curriculum, a learner).
  // The caller knows; the warning that an edit reaches them is only worth
  // showing when it does.
  inUse = true,
  // Read-only on a class: "Make my own copy" (iCreate, 2026-10-01, 167ba6df).
  // The caller copies the quest onto the class and opens the copy.
  onMakeCopy = null,
  // The class's quests ({quest_id, title}), so a teacher's copy can offer to
  // replace its original on the class when it is published (987218e0).
  classQuests = [],
  onClose, onDone,
}) {
  const confirm = useConfirm()
  // The AI draft panel shows only where AI is on for the org (the `ai`
  // module; MICROSCHOOL_FIRST_PLAN part 4). The signed-in user's org payload
  // (/api/auth/me, with the server's effective_modules) is the only copy the
  // editor has, so it answers only when it is the org being edited: a
  // superadmin working in another school still sees the panel, as before.
  // Read with useContext, not useOrganization, so a test or screen without
  // the provider degrades to today's behaviour instead of throwing.
  const signedInOrg = useContext(OrganizationContext)?.organization
  const aiOff = !!signedInOrg && signedInOrg.id === orgId && moduleKnownOff(signedInOrg, 'ai')
  // Whether each task shows the "Counts toward credit" subject picker. One
  // boolean, computed here, so the condition for showing it lives in one
  // place. Every context but staff training. It is NOT hidden for a school
  // with the credit modules off: every school picks subjects on nearly every
  // task (iCreate 386 of 399 in 60 days, Gryffin and Horizon all), and a task
  // with none credits the work as an elective (MICROSCHOOL_FIRST part 2,
  // reverted 2026-10-07 before it shipped). It lives under More options.
  const showCreditPicker = context !== 'training'
  const [questId, setQuestId] = useState(initialQuestId)
  const [trainingId, setTrainingId] = useState(initialTrainingId)
  const [quest, setQuest] = useState(null) // the server's copy
  const [loadError, setLoadError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  // The form.
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tasks, setTasks] = useState([blankTask()])
  const [xp, setXp] = useState('')
  // Training's finish line follows the task total until somebody types their
  // own number -- "do all of it" is what training usually means.
  const [xpFollowsTotal, setXpFollowsTotal] = useState(false)
  const [teachersMay, setTeachersMay] = useState(true)
  const [allowCustom, setAllowCustom] = useState(true)
  const [sourceMaterial, setSourceMaterial] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [curriculumPick, setCurriculumPick] = useState('')
  const [classSettings, setClassSettings] = useState(() => classSettingsFrom(classLink))
  const [training, setTraining] = useState(() => blankTrainingSettings(audience))
  const [dirty, setDirty] = useState(false)
  const touch = (fn) => (...args) => { setDirty(true); return fn(...args) }

  // A student quest's tasks always carry a subject: there is no "not for
  // credit" switch any more (b7a5fc1e, 2026-09-28), so a task that arrives
  // with none -- saved while that switch was off, or drafted without one --
  // takes its pillar's, which is also what its picker shows. Training keeps
  // what it has; its pickers are hidden and it earns no diploma credit.
  const withSubjects = useCallback((t) => (context === 'training' ? t : withPillarSubject(t)), [context])

  const fill = useCallback((q, { fresh = false } = {}) => {
    setQuest(q)
    setTitle(q.title || '')
    setDescription(q.description || '')
    setTasks((q.tasks || []).length
      ? q.tasks.map((t) => withSubjects({ ...blankTask(), ...t })) : [blankTask()])
    setXp(q.xp_threshold ? String(q.xp_threshold) : '')
    setXpFollowsTotal(fresh && context === 'training' && !q.xp_threshold)
    setTeachersMay(q.teachers_may_change_xp !== false)
    setAllowCustom(q.allow_custom_tasks !== false)
    setImageUrl(q.header_style === 'org_logo' ? '' : (q.header_image_url || ''))
    setDirty(false)
  }, [context, withSubjects])

  // Open: load the quest, or start the draft. The ref keeps a strict-mode
  // double mount (and a fast double click) from starting two drafts.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const open = async () => {
      try {
        let id = initialQuestId
        let tid = initialTrainingId
        let fresh = false
        if (!id) {
          const made = await questEditorApi.start(orgId, {
            context, classId, curriculumId, studentId, audience: context === 'training' ? audience : null,
          })
          id = made.quest_id
          tid = made.training_id || tid
          fresh = true
          setQuestId(id)
          setTrainingId(tid)
        }
        const q = await questEditorApi.load(orgId, id)
        fill(q, { fresh: fresh || (q.is_draft && !q.title) })
        // A teacher's copy of a class quest is a draft that remembers the
        // original's audience (and any dates asked for) on this class (owner,
        // 2026-10-02), so Publish to class reaches the same students.
        if (context === 'class' && !classLink && q.draft?.class_settings) {
          setClassSettings(classSettingsFrom(q.draft.class_settings))
        }
        if (context === 'training' && tid) {
          const cat = await questEditorApi.loadTraining(orgId, tid)
          setTraining(trainingSettingsFrom(cat, audience))
        }
      } catch (err) {
        setLoadError(err?.response?.data?.error || 'Could not open the quest')
      }
    }
    open()
  }, [])

  const editable = !!quest?.editable
  const isDraft = !!quest?.is_draft
  const originalOnClass = context === 'class' && quest?.draft?.copied_from
    ? classQuests.find((q) => q.quest_id === quest.draft.copied_from) || null : null
  const [replacing, setReplacing] = useState(false)

  // Each task's due date on THIS class (iCreate, ticket 26c91e25: "different
  // due dates for each week's reading assignment"). Only for a quest already
  // on the class -- a draft is not, and the date is the class's, not the
  // quest's -- and saved on its own the moment it changes, so it works on the
  // office's read-only quests too.
  const onClass = context === 'class' && !!classId && !!classLink && !!questId
  const [taskDates, setTaskDates] = useState({})
  const loaded = !!quest
  useEffect(() => {
    if (!onClass || !loaded || isDraft) return undefined
    let live = true
    questEditorApi.loadClassTasks(orgId, classId, questId)
      .then((rows) => {
        if (live) setTaskDates(Object.fromEntries(rows.filter((t) => t.due_date).map((t) => [t.id, t.due_date])))
      })
      .catch(() => { /* the dates are extra; the editor still works */ })
    return () => { live = false }
  }, [onClass, loaded, isDraft, orgId, classId, questId])

  const saveTaskDue = async (taskId, value) => {
    const before = taskDates[taskId] || null
    const iso = dueInputToIso(value)
    setTaskDates((d) => ({ ...d, [taskId]: iso }))
    try {
      await questEditorApi.saveTaskDueDate(orgId, classId, questId, taskId, iso)
      toast.success(iso ? 'Task due date saved' : 'Task due date cleared')
    } catch (err) {
      setTaskDates((d) => ({ ...d, [taskId]: before }))
      toast.error(err?.response?.data?.error || 'Could not save the due date')
    }
  }
  const taskDue = onClass && !isDraft ? { dates: taskDates, onChange: saveTaskDue } : null
  const taskXpTotal = useMemo(() => tasks.reduce(
    (sum, t) => sum + ((t.title || '').trim() ? Number(t.xp_value) || 0 : 0), 0), [tasks])
  const xpValue = xpFollowsTotal ? (taskXpTotal ? String(taskXpTotal) : '') : xp
  const xpLocked = !quest?.can_lock_xp && quest?.teachers_may_change_xp === false

  const questBody = () => {
    const body = {
      title: title.trim(),
      description: description.trim(),
      xp_threshold: xpValue === '' ? null : Number(xpValue),
      allow_custom_tasks: allowCustom,
      tasks: tasks.filter((t) => (t.title || '').trim()).map(taskBody),
    }
    if (quest?.can_lock_xp) body.teachers_may_change_xp = teachersMay
    if (allowCustom && sourceMaterial) body.source_material = sourceMaterial
    return body
  }

  // Save the quest itself. Returns the saved copy, or null after a toast.
  const saveQuest = async () => {
    if (xpValue !== '' && !(Number(xpValue) >= 0)) {
      toast.error('XP to finish has to be a number, or empty for no requirement')
      return null
    }
    const saved = await questEditorApi.save(orgId, questId, questBody())
    // Keep what the author is looking at; take the ids the server gave the
    // new tasks so their attachments can open.
    setQuest(saved)
    setTasks((prev) => {
      const kept = prev.filter((t) => (t.title || '').trim())
      const byOrder = saved.tasks || []
      const merged = kept.map((t, i) => ({ ...t, id: byOrder[i]?.id || t.id }))
      return merged.length ? merged : [blankTask()]
    })
    setDirty(false)
    return saved
  }

  // The context section on a quest that is already live. A draft sends these
  // with Publish instead.
  const saveContextSection = async () => {
    if (context === 'class' && classId && classLink) {
      const before = classSettingsFrom(classLink)
      const patch = {}
      if (classSettings.due !== before.due) patch.due_date = dueInputToIso(classSettings.due)
      if (scheduledEnabled && classSettings.release !== before.release) {
        patch.publish_at = releaseInputToIso(classSettings.release)
      }
      if (Object.keys(patch).length) await questEditorApi.saveClassLink(orgId, classId, questId, patch)
      if (JSON.stringify(classSettings.studentIds) !== JSON.stringify(before.studentIds)) {
        await questEditorApi.saveClassAudience(orgId, classId, questId, classSettings.studentIds)
      }
      // The office quest's finish line, when the office left it to teachers.
      if (!editable && !xpLocked && String(quest?.xp_threshold || '') !== xp) {
        await questEditorApi.saveClassLink(orgId, classId, questId, { xp_threshold: xp === '' ? 0 : Number(xp) })
      }
    }
    if (context === 'training' && trainingId) {
      await questEditorApi.saveTraining(orgId, trainingId, trainingSettingsBody(training))
    }
  }

  const checkClassAudience = () => {
    if (context === 'class' && Array.isArray(classSettings.studentIds) && classSettings.studentIds.length === 0) {
      toast.error('Pick at least one student, or choose Everyone')
      return false
    }
    return true
  }

  const save = async ({ close = false } = {}) => {
    if (!checkClassAudience()) return
    if (editable && !isDraft && !title.trim()) { toast.error('A quest needs a title'); return }
    setBusy(true)
    try {
      if (editable) {
        const saved = await saveQuest()
        if (!saved) return
      }
      if (!isDraft) await saveContextSection()
      else if (context === 'training' && trainingId) await saveContextSection()
      toast.success(isDraft ? 'Draft saved' : 'Quest saved')
      if (close) { onDone?.({ saved: true }); onClose?.() }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the quest')
    } finally {
      setBusy(false)
    }
  }

  const publish = async () => {
    if (!title.trim()) { toast.error('Give the quest a title before you publish it'); return }
    if (!checkClassAudience()) return
    setBusy(true)
    try {
      const saved = await saveQuest()
      if (!saved) return
      let body = {}
      if (context === 'library' && curriculumPick) body = { curriculum_id: curriculumPick }
      if (context === 'class') {
        body = {}
        if (classSettings.due) body.due_date = dueInputToIso(classSettings.due)
        if (scheduledEnabled && classSettings.release) body.publish_at = releaseInputToIso(classSettings.release)
        if (Array.isArray(classSettings.studentIds)) body.student_ids = classSettings.studentIds
        if (replacing && originalOnClass) body.replace_original = true
      }
      if (context === 'training') await saveContextSection()
      const out = await questEditorApi.publish(orgId, questId, context,
        { classId, curriculumId, trainingId, studentId, body })
      toast.success(out?.summary || publishedMessage(context, out, body))
      onDone?.({ published: true })
      onClose?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not publish the quest')
    } finally {
      setBusy(false)
    }
  }

  const discard = async () => {
    if (!(await confirm({
      title: 'Discard this draft?',
      body: 'The draft, its tasks and its attachments are deleted. This cannot be undone.',
      confirmLabel: 'Discard draft',
      cancelLabel: 'Keep it',
    }))) return
    setBusy(true)
    try {
      await questEditorApi.discard(orgId, questId)
      toast.success('Draft discarded')
      onDone?.({ discarded: true })
      onClose?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not discard the draft')
    } finally {
      setBusy(false)
    }
  }

  // Closing: a draft keeps what was typed (drafts are never lost), and one
  // with nothing in it is removed rather than left as a blank in Drafts. A live
  // quest with unsaved changes asks first.
  const close = async () => {
    if (!quest) { onClose?.(); return }
    if (isDraft && editable) {
      try {
        if (dirty) {
          await saveQuest()
          if (context === 'training' && trainingId) await saveContextSection()
        }
        await questEditorApi.discard(orgId, questId, { ifEmpty: true })
      } catch {
        // Nothing to lose by closing: what was saved is saved.
      }
      onDone?.({ closed: true })
      onClose?.()
      return
    }
    if (dirty && !(await confirm('Close without saving your changes?'))) return
    onClose?.()
  }

  const uploadImage = async (file) => {
    const url = await questEditorApi.uploadImage(orgId, questId, file)
    setImageUrl(url)
  }
  const removeImage = async () => {
    await questEditorApi.removeImage(orgId, questId)
    setImageUrl('')
  }

  const saveForAttachments = async () => {
    setBusy(true)
    try { await saveQuest() } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the quest')
    } finally { setBusy(false) }
  }

  const heading = !quest ? 'Quest'
    : isDraft ? (title.trim() ? `Draft: ${title.trim()}` : 'New quest')
      : `Edit “${title || quest.title}”`

  const footer = quest && (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {isDraft && editable && (
        <button type="button" onClick={discard} disabled={busy}
          className="mr-auto text-sm text-red-600 hover:underline disabled:opacity-50">
          Discard draft
        </button>
      )}
      <button type="button" onClick={() => setPreviewing(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-neutral-700 hover:bg-gray-50">
        <EyeIcon className="w-4 h-4" /> Preview quest
      </button>
      <button type="button" onClick={close} disabled={busy}
        className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100 disabled:opacity-50">
        Close
      </button>
      {isDraft && editable ? (
        <>
          <Button size="xs" variant="secondary" onClick={() => save()} disabled={busy}>
            Save draft
          </Button>
          <Button size="xs" onClick={publish} disabled={busy || !title.trim()}>
            {busy ? 'Working…' : ENDPOINT_WORDS[context]}
          </Button>
        </>
      ) : (editable || context === 'class' || context === 'training') ? (
        <Button size="xs" onClick={() => save({ close: true })} disabled={busy}>
          {busy ? 'Saving…' : editable ? 'Save' : 'Save class settings'}
        </Button>
      ) : null}
    </div>
  )

  return (
    // closeOnOverlayClick off while the preview is up: both modals listen for
    // Escape, and closing the preview must not also close the quest.
    <Modal isOpen onClose={close} title={heading} size="lg" footer={footer}
      closeOnOverlayClick={!previewing}>
      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4" role="alert">
          {loadError}
        </div>
      )}
      {!quest && !loadError && <p className="text-sm text-neutral-500">Opening…</p>}
      {quest && (
        <div className="space-y-5">
          {isDraft && (
            <p className="text-xs text-neutral-500 bg-neutral-50 border border-gray-200 rounded-lg px-3 py-2">
              This is a draft. Nobody else sees it until you publish it, and it stays in Drafts until
              you do. Files and links can be added now.
            </p>
          )}
          {!editable && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {quest.is_library
                ? 'This quest comes from the Optio library and is shared with other schools. Duplicate it to make a copy you can change.'
                : 'Only the person who made this quest, or your school office, can change it.'
                  + (context === 'class' ? ' You can set its dates and who it is for on your class below.' : '')}
              {onMakeCopy && (
                <button type="button" onClick={onMakeCopy}
                  className="ml-2 px-2 py-0.5 rounded-md border border-amber-300 bg-white text-amber-900 font-semibold hover:bg-amber-100">
                  Make my own copy
                </button>
              )}
            </p>
          )}
          {editable && !isDraft && inUse && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              This quest is in use. Changes reach everyone already on it. To change it for one
              class only, duplicate it first.
            </p>
          )}

          {editable && !aiOff && (
            <QuestAiDraftPanel
              startOpen={isDraft && !quest.title && !(quest.tasks || []).length}
              hasDraft={Boolean(title.trim() || description.trim() || tasks.some((t) => (t.title || '').trim()))}
              onDrafted={(d) => {
                setDirty(true)
                setTitle(d.title); setDescription(d.description); setTasks(d.tasks.map(withSubjects))
                setSourceMaterial(d.sourceMaterial || '')
              }} />
          )}

          {editable && (
            <HeaderImageField imageUrl={imageUrl} isDraft={isDraft} disabled={busy}
              fallbackLogo={context === 'training' ? orgLogo : null}
              onUpload={uploadImage} onRemove={removeImage} />
          )}

          <QuestDraftForm
            readOnly={!editable}
            title={title} setTitle={touch(setTitle)}
            description={description} setDescription={touch(setDescription)}
            tasks={tasks} setTasks={touch(setTasks)}
            questId={editable ? questId : null}
            showSubjects={showCreditPicker}
            onSaveForAttachments={saveForAttachments}
            taskDue={taskDue}
            minTaskXp={quest?.min_task_xp}
            titlePlaceholder={context !== 'training' ? 'Quest title (e.g. Watercolor Basics)'
              : audience === 'family' ? 'Quest title (e.g. Back to school night)'
                : audience === 'student' ? 'Quest title (e.g. Welcome to iCreate)'
                  : 'Quest title (e.g. Classroom management)'}
            descriptionPlaceholder={context !== 'training' ? 'What is this quest about?'
              : audience === 'family' ? 'What are families doing?'
                : audience === 'student' ? 'What are students doing?' : 'What are teachers learning?'}
            taskHint={'Preset tasks are copied to each learner when they start the quest. Leave it empty '
              + 'and they write their own. Every task needs evidence (a photo, a note or a link) before '
              + 'a learner can mark it done.'}
          />

          {/* Essentials first (MICROSCHOOL_FIRST_PLAN part 4): the finish
              line and "add their own tasks" sit behind More options, and the
              closed toggle says what they hold when it is not the default. */}
          <section className="border-t border-gray-100 pt-4">
            <MoreOptions label="for this quest" summary={questOptionsSummary({
              xpValue, xpLocked, lockOffered: !!quest.can_lock_xp, teachersMay,
              customOffered: editable, allowCustom,
            })}>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="quest-editor-xp">
                  XP required to finish <span className="text-neutral-400">(optional)</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input id="quest-editor-xp" type="number" min="0" step="25"
                    value={xpValue} disabled={xpLocked || (!editable && context !== 'class')}
                    onChange={(e) => { setDirty(true); setXpFollowsTotal(false); setXp(e.target.value) }}
                    placeholder="No requirement"
                    className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-neutral-50 disabled:text-neutral-500" />
                  {xpLocked && <span className="text-xs text-neutral-400">Set by your school office</span>}
                  {editable && !xpFollowsTotal && taskXpTotal > 0 && Number(xpValue || 0) !== taskXpTotal && (
                    <button type="button" onClick={() => { setDirty(true); setXp(String(taskXpTotal)) }}
                      className="text-xs text-optio-purple hover:underline">
                      Use all {taskXpTotal}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  A learner cannot mark the quest finished below this. Leave it empty and any amount finishes it.
                </p>
                {quest.can_lock_xp && (
                  <label className="mt-2 flex items-center gap-2 text-sm text-neutral-700">
                    <input type="checkbox" checked={teachersMay}
                      onChange={(e) => { setDirty(true); setTeachersMay(e.target.checked) }}
                      className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                    Teachers may change the XP to finish
                  </label>
                )}
              </div>
              {editable && (
                <label className="flex items-start gap-2 text-sm text-neutral-700">
                  <input type="checkbox" className="mt-0.5" checked={allowCustom}
                    onChange={(e) => { setDirty(true); setAllowCustom(e.target.checked) }} />
                  <span>
                    Let them add tasks of their own
                    <span className="block text-xs text-neutral-500">
                      {sourceMaterial
                        ? 'They can generate extra tasks for themselves, written from the document you uploaded.'
                        : 'Alongside the ones you set.'}
                    </span>
                  </span>
                </label>
              )}
            </MoreOptions>
          </section>

          {context === 'library' && isDraft && editable && curricula.length > 0 && (
            <section className="border-t border-gray-100 pt-4">
              <span className="block text-xs font-medium text-neutral-600 mb-1">
                Put it on a curriculum when you publish (optional)
              </span>
              <SearchSelect value={curriculumPick} onChange={setCurriculumPick} options={curricula}
                getId={(c) => c.id} getLabel={(c) => c.title}
                placeholder="Search curriculum…" emptyLabel="No curriculum matches" />
              <p className="mt-1 text-xs text-neutral-400">
                It is kept there for next term. The curriculum’s classes do not get it; assign it to a class from its row.
              </p>
            </section>
          )}

          {context === 'class' && (
            <section className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-semibold text-neutral-900 mb-2">On this class</h3>
              <ClassSettingsSection value={classSettings} students={students}
                scheduledEnabled={scheduledEnabled}
                onChange={(patch) => { setDirty(true); setClassSettings((s) => ({ ...s, ...patch })) }}>
                {/* A teacher's copy of a quest still on the class: put it in the
                    original's place instead of beside it (987218e0). */}
                {isDraft && originalOnClass && (
                  <label className="flex items-start gap-2 text-sm text-neutral-800">
                    <input type="checkbox" checked={replacing} onChange={(e) => setReplacing(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                    <span>
                      Replace the original on this class (“{originalOnClass.title}”)
                      <span className="block text-xs text-neutral-500">{REPLACE_COPY}</span>
                    </span>
                  </label>
                )}
              </ClassSettingsSection>
            </section>
          )}

          {context === 'training' && (
            <section className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-semibold text-neutral-900 mb-2">In training</h3>
              <TrainingSettingsFields value={training} audience={audience} orgId={orgId}
                categories={trainingCategories}
                onChange={(patch) => { setDirty(true); setTraining((s) => ({ ...s, ...patch })) }} />
            </section>
          )}
        </div>
      )}

      <QuestPreviewModal
        open={previewing} onClose={() => setPreviewing(false)}
        title={title} description={description} tasks={tasks}
        imageUrl={imageUrl || (context === 'training' ? orgLogo : null)}
        containImage={!imageUrl && context === 'training' && !!orgLogo}
        xpThreshold={xpValue === '' ? null : Number(xpValue)}
        audience={context === 'training' ? audience : 'student'} allowOwnTasks={allowCustom}
      />
    </Modal>
  )
}

/**
 * The closed quest-level "More options" line: only what differs from a new
 * quest's defaults (no finish line, teachers may change it, own tasks on).
 */
export function questOptionsSummary({ xpValue, xpLocked, lockOffered, teachersMay, customOffered, allowCustom }) {
  const parts = []
  if (xpValue !== '' && xpValue != null) parts.push(`${xpValue} XP to finish`)
  if (xpLocked) parts.push('XP to finish set by your school office')
  else if (lockOffered && !teachersMay) parts.push('Teachers may not change the XP')
  if (customOffered && !allowCustom) parts.push('No tasks of their own')
  return parts.join(' · ')
}

function publishedMessage(context, out, body) {
  if (context === 'student') return 'Published and assigned'
  if (context === 'class') {
    const n = out?.students_enrolled
    if (body.publish_at) return `Published. Students will see it on ${new Date(body.publish_at).toLocaleDateString()}.`
    return typeof n === 'number' ? `Published to the class (${n} ${n === 1 ? 'student' : 'students'})` : 'Published to the class'
  }
  if (context === 'curriculum') {
    const n = out?.pushed_to_classes || 0
    return n ? `Published and added to ${n} class${n === 1 ? '' : 'es'}` : 'Published to the curriculum'
  }
  if (context === 'training') {
    const n = out?.assigned?.enrolled
    return typeof n === 'number' && n > 0 ? `Published and put on ${n} ${n === 1 ? 'account' : 'accounts'}` : 'Published'
  }
  return out?.curriculum?.title ? `Published and added to ${out.curriculum.title}` : 'Published. Assign it from its row when you are ready.'
}
