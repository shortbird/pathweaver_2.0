/**
 * The home page's Current quests and Next Up: how they are grouped, sorted,
 * and which tasks come first.
 *
 * iCreate, ticket 4cc854cd (approved by the owner): "Is there a way to see
 * the quests by class as a student? Or to see them grouped here by class? We
 * still wanted to have these be able to be sorted. By date, order of quest,
 * class, priority. On up next, idk how that prioritizes the tasks."
 *
 *  - Current quests are grouped by class (snapshotQuestGroups.groupQuests,
 *    the Learning Snapshot's groups) and inside a class by the curriculum the
 *    quest came from (`source_class.curriculum_title`, sent by the dashboard
 *    read). Quests on no curriculum sit directly under the class.
 *  - A sort picks the order inside each group: Recent (today's behaviour),
 *    Due date, Class order (the school's order), Name.
 *  - Next Up used to take each quest's first unfinished task, one per pillar,
 *    up to four: it never looked at a date. Now dated work comes first,
 *    soonest first; the rest keeps the old rule, walked in class order.
 */

import { groupQuests, questActivity, questTitle } from './snapshotQuestGroups'

export const CURRENT_SORTS = [
  { value: 'recent', label: 'Recent' },
  { value: 'due', label: 'Due date' },
  { value: 'order', label: 'Class order' },
  { value: 'name', label: 'Name' },
]

export const SORT_STORAGE_KEY = 'optio.currentQuests.sort'

const VALID = new Set(CURRENT_SORTS.map((s) => s.value))

/** The remembered sort, or 'recent'. Storage can throw (private mode). */
export function readStoredSort() {
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY)
    return VALID.has(v) ? v : 'recent'
  } catch {
    return 'recent'
  }
}

export function writeStoredSort(value) {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, value)
  } catch {
    // storage unavailable: the choice just does not survive a reload
  }
}

/** The date the student is held to, as a timestamp, or null. */
function toTime(raw) {
  if (!raw) return null
  const t = new Date(raw).getTime()
  return Number.isNaN(t) ? null : t
}

export const questDue = (q) => toTime(q?.class_assignment?.due_date)

/** [curriculum rank, place in it]: a quest's place in the school's order.
 * Quests on no curriculum come before the curricula (they render first),
 * ordered by the class's own sequence. Unknown places sort last. */
export function questClassOrder(q) {
  const src = q?.source_class || {}
  const BIG = Number.MAX_SAFE_INTEGER
  const hasCurriculum = typeof src.curriculum_rank === 'number'
  const rank = hasCurriculum ? src.curriculum_rank : -1
  const pos = hasCurriculum
    ? (typeof src.curriculum_position === 'number' ? src.curriculum_position
      : (typeof src.class_position === 'number' ? src.class_position : BIG))
    : (typeof src.class_position === 'number' ? src.class_position : BIG)
  return [rank, pos]
}

const byName = (a, b) => questTitle(a).localeCompare(questTitle(b))
const byRecent = (a, b) => questActivity(b) - questActivity(a)

/** Undated last, soonest first. */
export function compareDue(a, b) {
  const da = questDue(a)
  const db = questDue(b)
  if (da === null && db === null) return 0
  if (da === null) return 1
  if (db === null) return -1
  return da - db
}

export function compareClassOrder(a, b) {
  const [ra, pa] = questClassOrder(a)
  const [rb, pb] = questClassOrder(b)
  return (ra - rb) || (pa - pb)
}

export const CURRENT_COMPARE = {
  recent: (a, b) => byRecent(a, b) || byName(a, b),
  due: (a, b) => compareDue(a, b) || byRecent(a, b) || byName(a, b),
  order: (a, b) => compareClassOrder(a, b) || byName(a, b),
  name: (a, b) => byName(a, b) || byRecent(a, b),
}

/**
 * groupQuests' class groups, each split into curriculum sections and sorted:
 * [{key, label, former, personal, quests, loose, sections:[{key, title, quests}]}].
 * `quests` is the whole group in sort order; `loose` and `sections` the same
 * quests split for drawing.
 */
export function groupCurrentQuests(quests, sortBy = 'recent') {
  const compare = CURRENT_COMPARE[sortBy] || CURRENT_COMPARE.recent
  return groupQuests(quests, 'recent').map((g) => {
    const sorted = [...g.quests].sort(compare)
    const loose = []
    const sections = new Map()
    for (const q of sorted) {
      const src = q.source_class || {}
      if (!src.curriculum_title) {
        loose.push(q)
        continue
      }
      const key = src.curriculum_id || src.curriculum_title
      if (!sections.has(key)) {
        sections.set(key, {
          key,
          title: src.curriculum_title,
          rank: typeof src.curriculum_rank === 'number' ? src.curriculum_rank : Number.MAX_SAFE_INTEGER,
          quests: [],
        })
      }
      sections.get(key).quests.push(q)
    }
    const ordered = [...sections.values()].sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
    return { ...g, quests: sorted, loose, sections: ordered }
  })
}

export const NEXT_UP_MAX = 4

/**
 * Up to four tasks for Next Up, one per quest:
 *   1. tasks with a due date (the task's own, else its quest's class due
 *      date), soonest first, ties in class order;
 *   2. the slots left go to the rest by the old rule -- one per pillar
 *      first, then other quests -- walked in class order, so with no dates
 *      and no class order it is exactly the old list.
 */
export function pickNextUpTasks(activeQuests, max = NEXT_UP_MAX) {
  const candidates = []
  ;(activeQuests || []).forEach((quest, index) => {
    const questData = quest.quests || quest
    const nextTask = (questData.quest_tasks || []).find((task) => !task.is_completed)
    if (!nextTask) return
    candidates.push({
      ...nextTask,
      questId: quest.quest_id || quest.id,
      questTitle: questData.title,
      dueAt: toTime(nextTask.due_date) ?? questDue(quest),
      _quest: quest,
      _index: index,
    })
  })

  // Class work before the student's own, classes in the order the page draws
  // them (by name), then the school's order inside a class; ties keep the
  // order the quests came in.
  const classKey = (t) => {
    const src = t._quest?.source_class
    return src?.id ? [0, src.name || ''] : [1, '']
  }
  const inClassOrder = (a, b) => {
    const [pa, na] = classKey(a)
    const [pb, nb] = classKey(b)
    return (pa - pb) || na.localeCompare(nb) ||
      compareClassOrder(a._quest, b._quest) || (a._index - b._index)
  }
  const strip = ({ _quest, _index, ...task }) => task

  const dated = candidates.filter((t) => t.dueAt !== null)
    .sort((a, b) => (a.dueAt - b.dueAt) || inClassOrder(a, b))
  const selected = dated.slice(0, max)
  const usedQuestIds = new Set(selected.map((t) => t.questId))

  const undated = candidates.filter((t) => t.dueAt === null).sort(inClassOrder)
  const usedPillars = new Set()
  for (const task of undated) {
    const pillar = task.pillar?.toLowerCase() || 'wellness'
    if (!usedPillars.has(pillar) && !usedQuestIds.has(task.questId) && selected.length < max) {
      selected.push(task)
      usedPillars.add(pillar)
      usedQuestIds.add(task.questId)
    }
  }
  for (const task of undated) {
    if (!usedQuestIds.has(task.questId) && selected.length < max) {
      selected.push(task)
      usedQuestIds.add(task.questId)
    }
  }
  return selected.map(strip)
}
