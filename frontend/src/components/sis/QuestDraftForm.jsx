import React from 'react'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'

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

export const PILLARS = [
  ['art', 'Arts & Creativity'],
  ['stem', 'STEM'],
  ['communication', 'Communication'],
  ['wellness', 'Life & Wellness'],
  ['civics', 'Society & Culture'],
]
export const PILLAR_LABEL = Object.fromEntries(PILLARS)

// 25 is the XP floor since the scale was halved (2026-06-15), and the step
// matches it so the picker can't produce a value the backend will round.
export const blankTask = () => ({ title: '', pillar: 'art', xp_value: 100, is_required: true })

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

export function TaskRows({ tasks, setTasks, addLabel = 'Add a preset task' }) {
  const update = (i, patch) => setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  const remove = (i) => setTasks((prev) => prev.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-2">
      {tasks.map((t, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
          <input value={t.title} onChange={(e) => update(i, { title: e.target.value })}
            placeholder={`Task ${i + 1} — what should they do?`} className={inputCls} />
          <div className="flex flex-wrap items-center gap-2">
            <select value={t.pillar} onChange={(e) => update(i, { pillar: e.target.value })}
              aria-label={`Task ${i + 1} pillar`}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              {PILLARS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <label className="flex items-center gap-1 text-sm text-neutral-600">
              XP
              <input type="number" min={25} step={25} value={t.xp_value}
                onChange={(e) => update(i, { xp_value: e.target.value })}
                aria-label={`Task ${i + 1} XP`}
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
      <button type="button" onClick={() => setTasks((prev) => [...prev, blankTask()])}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-optio-purple hover:underline">
        <PlusIcon className="w-4 h-4" /> {addLabel}
      </button>
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
        <TaskRows tasks={tasks} setTasks={setTasks} addLabel={addLabel} />
      </div>
    </div>
  )
}
