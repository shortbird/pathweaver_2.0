import React from 'react'
import { PlusIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { PILLARS as PILLAR_CONFIG } from '../../config/pillars'

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
export const blankTask = () => ({ title: '', description: '', pillar: 'art', xp_value: 100, is_required: true })

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

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
export function TaskRows({ tasks, setTasks, addLabel = 'Add a preset task', showPillars = true }) {
  const update = (i, patch) => setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  const remove = (i) => setTasks((prev) => prev.filter((_, idx) => idx !== i))
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
              <select value={t.pillar} onChange={(e) => update(i, { pillar: e.target.value })}
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
            <button type="button" onClick={() => remove(i)}
              className="ml-auto p-1 text-gray-400 hover:text-red-500" aria-label={`Remove task ${i + 1}`}>
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
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
 * The whole draft: title, description, tasks. The caller owns the state and the
 * submit, because where a finished quest gets attached differs per screen — a
 * class, or the school's quest catalog.
 */
export default function QuestDraftForm({
  title, setTitle, description, setDescription, tasks, setTasks,
  titlePlaceholder = 'Quest title',
  descriptionPlaceholder = 'What is this quest about?',
  taskHint = 'Preset tasks are copied to each learner when they start the quest. Leave it empty and they write their own.',
  addLabel,
  showPillars = true,
}) {
  return (
    <div className="space-y-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder={titlePlaceholder} aria-label="Quest title" className={inputCls} />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder={descriptionPlaceholder} rows={2} aria-label="Quest description"
        className={`${inputCls} resize-none`} />
      <div>
        <p className="text-xs text-neutral-400 mb-2">{taskHint}</p>
        <TaskRows tasks={tasks} setTasks={setTasks} addLabel={addLabel} showPillars={showPillars} />
      </div>
    </div>
  )
}
