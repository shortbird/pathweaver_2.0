/**
 * The class's quests under curriculum headings (iCreate, 1a630837: "see class
 * quests grouped by curriculum").
 *
 * Each quest carries the curriculum the server put it under
 * (curriculum_id / curriculum_title). A quest saved on several of the class's
 * curricula goes under the one attached to the class first -- the server
 * decides, so every screen agrees. Headings follow the order of the
 * curriculum cards above the list; quests on no curriculum come last, under
 * "Other quests". Within a heading the class's own order is kept.
 *
 * With no quest on any curriculum the list stays flat: no headings at all.
 *
 * Returns [{quest, heading}] where heading is set on the first quest of each
 * group and null otherwise.
 */
export const OTHER_QUESTS = 'Other quests'

export function groupByCurriculum(quests = [], curricula = []) {
  if (!quests.some((q) => q.curriculum_id)) return quests.map((quest) => ({ quest, heading: null }))
  const rank = new Map(curricula.map((c, i) => [c.curriculum_id, i]))
  const key = (q) => (q.curriculum_id ? (rank.get(q.curriculum_id) ?? curricula.length) : curricula.length + 1)
  const sorted = quests
    .map((quest, i) => ({ quest, i }))
    .sort((a, b) => key(a.quest) - key(b.quest) || a.i - b.i)
    .map(({ quest }) => quest)
  let last
  return sorted.map((quest) => {
    const title = quest.curriculum_id ? (quest.curriculum_title || 'Curriculum') : OTHER_QUESTS
    const heading = title !== last ? title : null
    last = title
    return { quest, heading }
  })
}
