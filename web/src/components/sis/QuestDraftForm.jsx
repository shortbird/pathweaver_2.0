import React, { useState } from 'react'
import { PlusIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline'
import { PILLARS as PILLAR_CONFIG } from '../../config/pillars'
import TaskSubjectPicker from './TaskSubjectPicker'
import QuestResourcesPanel from './QuestResourcesPanel'
import { defaultSubjectForPillar, evenSplit } from '../../constants/diplomaSubjects'
import { INPUT_CLASS } from '../ui/Input'

/**
 * The form for building a school quest: a title, a description, and the preset
 * tasks every learner receives when they start it.
 *
 * Lifted out of ClassQuestsManager on 2026-08-06 so the Quests page can use the
 * same one. iCreate asked "where does the quest get built?" of the family-quest
 * screen, which until then could only attach a quest somebody had already made
 * somewhere else — a dead end if you have not made one.
 *
 * Deliberately one component rather than two similar ones: the pillar list, the
 * XP floor and the required flag are rules about what a quest IS, and a second
 * copy of them drifts.
 */

/**
 * The five pillars, named exactly as the rest of the platform names them.
 *
 * These were hardcoded here as "Arts & Creativity", "Life & Wellness" and
 * "Society & Culture" — the names the pillars carried before they were
 * shortened in January 2025. Those strings now live only in the LEGACY map in
 * utils/pillarMappings, so a teacher picking "Arts & Creativity" in the SIS was
 * labelling a task the learner would then see as "Art". Read from the shared
 * config instead of restating it, because a copy is what drifted last time.
 */
const PILLAR_ORDER = ['art', 'stem', 'communication', 'wellness', 'civics']
export const PILLARS = PILLAR_ORDER.map((key) => [key, PILLAR_CONFIG[key].display_name])
export const PILLAR_LABEL = Object.fromEntries(PILLARS)

// 25 is the XP floor since the scale was halved (2026-06-15), and the step
// matches it so the picker can't produce a value the backend will round.
export const MIN_TASK_XP = 25

// description is the instructional text under the task title — what the learner
// reads when they open it. It was always stored and always shown (the preview
// and the learner's own task list both render it), but until 2026-08-17 no form
// wrote it: only the AI drafter set one, so a task typed by hand had none and a
// generated one could not be corrected. iCreate: "you can see the instructional
// text that goes with the task, which is nice. But there is no way to edit it!"
// diploma_subjects is the credit the task earns, and it is set here rather
// than left out because both task tables DEFAULT it to ['Electives'] -- a task
// saved without one was credited as an elective whatever the work was.
export const blankTask = () => ({
  title: '', description: '', pillar: 'art', xp_value: 100, is_required: true,
  diploma_subjects: [defaultSubjectForPillar('art')],
  subject_xp_distribution: evenSplit([defaultSubjectForPillar('art')], 100)
})

const inputCls = INPUT_CLASS
/**
 * Has anyone chosen a subject on any of these tasks, or are they all still on
 * their pillar's default? Where a caller hides the subject pickers (staff
 * training), a quest whose tasks carry chosen subjects shows them anyway, so a
 * subject somebody picked is never saved from behind a hidden control.
 */
export function tasksCarryChosenSubjects(tasks) {
  return (tasks || []).some((t) => {
    const subjects = t.diploma_subjects || []
    if (subjects.length > 1) return true
    return subjects.length === 1 && subjects[0] !== defaultSubjectForPillar(t.pillar)
  })
}

/**
 * A task with no subject at all gets its pillar's. An empty list is what the
 * retired "This quest counts toward high school credit" switch wrote when it
 * was turned off, and the server keeps [] as "no credit" -- so a quest saved
 * that way would show its pillar's subject in the picker below (the picker
 * never displays nothing) while silently saving no credit. Filling it here
 * makes the save match the screen. Owner decision, 2026-09-28 (b7a5fc1e):
 * quests do not decide credit; a task earns it when a student requests it.
 */
export function withPillarSubject(task) {
  if ((task.diploma_subjects || []).length) return task
  const next = [defaultSubjectForPillar(task.pillar)]
  return { ...task, diploma_subjects: next, subject_xp_distribution: evenSplit(next, task.xp_value) }
}

/**
 * The patch a pillar change makes. The subject follows the pillar ONLY while it
 * is still the pillar's own default -- a teacher who has chosen Social Studies
 * has chosen it, and changing the pillar afterwards must not quietly undo that.
 */
export function followPillar(task, pillar) {
  const current = task.diploma_subjects || []
  const wasDefault = current.length <= 1 &&
    (current.length === 0 || current[0] === defaultSubjectForPillar(task.pillar))
  if (!wasDefault) return { pillar }
  const next = [defaultSubjectForPillar(pillar)]
  return { pillar, diploma_subjects: next, subject_xp_distribution: evenSplit(next, task.xp_value) }
}

/**
 * showPillars=false hides the pillar picker where the dimension is noise rather
 * than a choice. The task still carries a pillar in the database: it is NOT NULL
 * on quest_template_tasks and user_quest_tasks, and the XP award path validates
 * it three times over before writing user_skill_xp — so hiding the control does
 * not remove the pillar, it just leaves blankTask()'s default in place.
 *
 * That is the catch, and why the training page stopped passing it on 2026-08-17:
 * a hidden control still writes a value. Every task an admin typed by hand went
 * in as Art, and ten of iCreate's sixteen orientation tasks are filed there —
 * "Find the Absences feature in Optio" among them. Hide it only where the
 * default is genuinely as good as any answer.
 */
export function TaskRows({ tasks, setTasks, addLabel = 'Add a preset task', showPillars = true, showSubjects = true, questId = null, onSaveForAttachments = null }) {
  const update = (i, patch) => setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  const remove = (i) => setTasks((prev) => prev.filter((_, idx) => idx !== i))
  // iCreate, 2026-09-07 (4da3680d): "I'd also like to be able to duplicate
  // tasks." The copy lands at the end of the list, not next to its source, so
  // the list being read does not reshuffle. It has no id until the next save:
  // it is a new task, with its own attachments to come.
  const duplicate = (i) => setTasks((prev) => {
    const { id: _id, ...copy } = prev[i]
    return [...prev, { ...copy }]
  })
  // Order is the order learners see, and the row's order_index is just its
  // position in this list. A sixteen-station orientation walks a building in
  // sequence, and rewriting every title to reshuffle two of them is not an edit
  // anybody should have to make.
  const move = (i, delta) => setTasks((prev) => {
    const to = i + delta
    if (to < 0 || to >= prev.length) return prev
    const next = [...prev]
    ;[next[i], next[to]] = [next[to], next[i]]
    return next
  })
  return (
    <div className="space-y-2">
      {tasks.map((t, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <span className="mt-2 text-xs font-medium text-neutral-400 w-5 shrink-0">{i + 1}.</span>
            <input value={t.title} onChange={(e) => update(i, { title: e.target.value })}
              placeholder={`Task ${i + 1} — what should they do?`} className={inputCls} />
            <div className="flex flex-col shrink-0">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                aria-label={`Move task ${i + 1} up`}
                className="p-0.5 text-gray-400 hover:text-optio-purple disabled:opacity-30 disabled:hover:text-gray-400">
                <ChevronUpIcon className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === tasks.length - 1}
                aria-label={`Move task ${i + 1} down`}
                className="p-0.5 text-gray-400 hover:text-optio-purple disabled:opacity-30 disabled:hover:text-gray-400">
                <ChevronDownIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          <textarea value={t.description || ''} onChange={(e) => update(i, { description: e.target.value })}
            placeholder="Instructions the learner reads when they open this task (optional)"
            rows={2} aria-label={`Task ${i + 1} instructions`}
            className={`${inputCls} resize-y text-neutral-600`} />
          <div className="flex flex-wrap items-center gap-2">
            {showPillars && (
              <select value={t.pillar} onChange={(e) => update(i, followPillar(t, e.target.value))}
                aria-label={`Task ${i + 1} pillar`}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {PILLARS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            )}
            <label className="flex items-center gap-1 text-sm text-neutral-600">
              XP
              <input type="number" min={MIN_TASK_XP} step={MIN_TASK_XP} value={t.xp_value}
                onChange={(e) => update(i, { xp_value: e.target.value })}
                aria-label={`Task ${i + 1} XP`}
                title={`${MIN_TASK_XP} is the smallest a task can be worth`}
                className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-neutral-600">
              <input type="checkbox" checked={t.is_required}
                onChange={(e) => update(i, { is_required: e.target.checked })} />
              Required
            </label>
            <button type="button" onClick={() => duplicate(i)} disabled={!t.title.trim()}
              className="ml-auto p-1 text-gray-400 hover:text-optio-purple disabled:opacity-30"
              title="Make a copy of this task at the end of the list"
              aria-label={`Duplicate task ${i + 1}`}>
              <DocumentDuplicateIcon className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => remove(i)}
              className="p-1 text-gray-400 hover:text-red-500" aria-label={`Remove task ${i + 1}`}>
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
          {showSubjects && (
            <TaskSubjectPicker
              subjects={t.diploma_subjects} distribution={t.subject_xp_distribution}
              xpValue={t.xp_value} pillar={t.pillar} idPrefix={`draft-task-${i}`}
              onChange={(patch) => update(i, patch)} />
          )}
          {/* A saved task can carry its own video, link or file. A task typed
              into the form and not saved yet has no id to attach to, so it
              waits for the save. */}
          {questId && t.id && (
            <QuestResourcesPanel questId={questId} taskId={t.id} compact />
          )}
          {/* The quest editor (P6) saves the whole draft on this click, which
              gives the new task its id, so its files can go on straight away. */}
          {questId && !t.id && onSaveForAttachments && t.title.trim() && (
            <button type="button" onClick={onSaveForAttachments}
              className="text-xs text-optio-purple hover:underline">
              Save to add files and links to this task
            </button>
          )}
        </div>
      ))}
      {/* Deliberately a filled button rather than the text link it used to be.
          A generated draft fills this list with tasks, and the link underneath
          them read as part of the last row: iCreate asked for a sixth task,
          did not find this, and regenerated the whole quest to get one. */}
      <button type="button" onClick={() => setTasks((prev) => [...prev, blankTask()])}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-optio-purple/40 bg-optio-purple/5 text-sm font-medium text-optio-purple hover:bg-optio-purple/10">
        <PlusIcon className="w-4 h-4" /> {addLabel}
      </button>
      <p className="text-[11px] text-neutral-400">
        A task is worth at least {MIN_TASK_XP} XP — that is the platform floor, so a smaller
        number is raised to it when you save.
      </p>
    </div>
  )
}

/**
 * A quest's tasks for somebody who may read them and not change them: a
 * teacher looking at the office's quest on their class (P6, 2026-09-23).
 */
export function ReadOnlyTasks({ tasks }) {
  const real = (tasks || []).filter((t) => (t.title || '').trim())
  if (!real.length) {
    return <p className="text-sm text-neutral-500">No preset tasks. Students write their own.</p>
  }
  return (
    <ol className="space-y-1.5" aria-label="Tasks">
      {real.map((t, i) => (
        <li key={t.id || i} className="text-sm">
          <span className="text-neutral-400 mr-1.5">{i + 1}.</span>
          <span className="text-neutral-800">{t.title}</span>
          <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-neutral-500">
            {PILLAR_LABEL[t.pillar] || t.pillar} · {t.xp_value} XP{t.is_required ? ' · required' : ''}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * The whole draft: title, description, tasks. The caller owns the state and the
 * submit, because where a finished quest gets attached differs per screen — a
 * class, or the school's quest catalog.
 */
export default function QuestDraftForm({
  title, setTitle, description, setDescription, tasks, setTasks,
  titlePlaceholder = 'Quest title',
  descriptionPlaceholder = 'What is this quest about?',
  // Says that evidence is required. It always has been — the completion
  // endpoint refuses a task with nothing behind it — but nothing on the
  // authoring screen said so, so a teacher writing a quest concluded it
  // would not be asked for (iCreate, 2026-09-05, c7615777: "the quests
  // aren't asking for any evidence to be uploaded. We do need that!").
  // The answer belongs where the question is asked, not in a support reply.
  taskHint = 'Preset tasks are copied to each learner when they start the quest. Leave it empty and they write their own. Every task needs evidence — a photo, a note or a link — before a learner can mark it done.',
  addLabel,
  showPillars = true,
  // The saved quest this form is editing, if any. With it, the quest and each
  // saved task get a Resources panel -- the training editor had none, so a
  // teacher-training video could only be pasted as text into a description
  // (iCreate, 2026-09-08, 774e2fe2: "I need to be able to link to videos in
  // the training section"). Left null on a brand-new draft: there is nothing
  // to attach to until the first save.
  questId = null,
  // Whether each task shows the diploma subject it earns credit toward. There
  // is no quest-level credit switch: credit lives on tasks and is only ever
  // granted when a student requests it, so every quest's tasks keep their
  // subjects. The switch that was here ("This quest counts toward high school
  // credit") was retired on 2026-09-28 (Molly, iCreate, b7a5fc1e: "I keep
  // having to go back in to edit and uncheck that box"). Staff training passes
  // false: a teacher's orientation earns no diploma credit, and a picker on
  // every one of sixteen tasks was the noise iCreate asked to lose (1aed3f6c).
  // Its tasks still carry their pillar's default in the database.
  showSubjects = true,
  // Called by a task row that has no id yet when its author wants to attach
  // something to it: the quest editor saves, and the row comes back with one.
  onSaveForAttachments = null,
  // Where the rows get read-only: a teacher looking at the office's quest.
  readOnly = false,
}) {
  // Decided once, on open: a picker that appeared or vanished mid-edit would
  // be stranger than one that stays put.
  const [subjectsShown] = useState(() => showSubjects || tasksCarryChosenSubjects(tasks))
  if (readOnly) {
    return (
      <div className="space-y-3">
        <div>
          <p className="text-base font-semibold text-neutral-900">{title || 'Untitled quest'}</p>
          {description && <p className="text-sm text-neutral-600 mt-1 whitespace-pre-line">{description}</p>}
        </div>
        <ReadOnlyTasks tasks={tasks} />
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder={titlePlaceholder} aria-label="Quest title" className={inputCls} />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder={descriptionPlaceholder} rows={2} aria-label="Quest description"
        className={`${inputCls} resize-none`} />
      {questId && (
        <div>
          <p className="text-xs text-neutral-400 mb-1">
            Videos, links and files for the whole quest. Anything that belongs to one step goes on that task below.
          </p>
          <QuestResourcesPanel questId={questId} />
        </div>
      )}
      <div>
        <p className="text-xs text-neutral-400 mb-2">{taskHint}</p>
        <TaskRows tasks={tasks} setTasks={setTasks} addLabel={addLabel} showPillars={showPillars}
          showSubjects={subjectsShown} questId={questId}
          onSaveForAttachments={onSaveForAttachments} />
      </div>
    </div>
  )
}
