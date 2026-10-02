/**
 * The Learning Snapshot's active quests, grouped by the class each came
 * through and sorted inside each group.
 *
 * iCreate, 2026-10-01 (d8a2a8d4, Marika): "make all the quests in a student's
 * learning snapshot be categorized and sortable? It is super chaotic". Every
 * active quest used to sit in one list in whatever order the database
 * returned. The server now sends `source_class` on each quest -- {id, name,
 * enrolled} or null for the student's own -- and this is the one place that
 * turns it into groups.
 *
 * Group order: the classes the student is in (by name), then their own
 * quests ("Personal"), then classes they have left. The last group is the
 * leftovers an admin is usually looking for, so it is labelled as such rather
 * than mixed in with current work.
 */

export const SORTS = [
  { value: 'recent', label: 'Recent activity' },
  { value: 'name', label: 'Name' },
  { value: 'progress', label: 'Progress' },
]

export const PERSONAL_LABEL = 'Personal'

const questOf = (q) => q.quests || q

export const questTitle = (q) => questOf(q).title || ''

export const questIdOf = (q) => questOf(q).id || q.quest_id

/** 0-100. The advisor and parent overviews send `progress`; the home page
 * sends `completed_tasks` and the quest's `task_count`. */
export function questProgress(q) {
  if (q.progress && typeof q.progress.percentage === 'number') return q.progress.percentage
  const total = questOf(q).task_count || 0
  if (!total) return 0
  return Math.round(((q.completed_tasks || 0) / total) * 100)
}

/** The newest thing that happened on the quest, as a sortable timestamp. */
export function questActivity(q) {
  const raw = q.last_activity_at || q.last_picked_up_at || q.started_at
  const t = raw ? new Date(raw).getTime() : NaN
  return Number.isNaN(t) ? 0 : t
}

const COMPARE = {
  recent: (a, b) => questActivity(b) - questActivity(a),
  name: (a, b) => questTitle(a).localeCompare(questTitle(b)),
  progress: (a, b) => questProgress(b) - questProgress(a),
}

/**
 * [{key, label, former, quests}] for the quests, each group sorted by `sortBy`
 * (ties broken by name so the order is stable).
 */
export function groupQuests(quests, sortBy = 'recent') {
  const groups = new Map()
  for (const q of quests || []) {
    const src = q.source_class || null
    const key = src?.id ? `class:${src.id}` : 'personal'
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: src?.id ? (src.name || 'A class') : PERSONAL_LABEL,
        former: Boolean(src?.id) && src.enrolled === false,
        personal: !src?.id,
        quests: [],
      })
    }
    groups.get(key).quests.push(q)
  }
  const compare = COMPARE[sortBy] || COMPARE.recent
  const byName = COMPARE.name
  for (const g of groups.values()) {
    g.quests.sort((a, b) => compare(a, b) || byName(a, b))
  }
  const rank = (g) => (g.personal ? 1 : g.former ? 2 : 0)
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
}
