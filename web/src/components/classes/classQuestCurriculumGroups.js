/**
 * A class's quests on the student's class page, under their curriculum
 * headings.
 *
 * iCreate, ticket 8700c16d (an org admin who is also a parent, on her son's
 * "Independent study" class): "he sees all the quests I assigned in
 * independent study class, but they aren't organized by class (or in any way
 * for that matter.)" A class like that carries several curricula (Applied
 * Physics, U.S. History 1, ...) and the page listed every quest as one flat
 * run. The class quests read now sends `curriculum_title` per row (null for
 * a quest on none of the class's curricula) and `curriculum_rank` (the
 * curriculum's place on the class), and this turns them into sections.
 *
 * Shape: { loose, sections }. `loose` are the quests on no curriculum: they
 * sit directly under the class, first, as the class's own work. `sections`
 * are [{ key, title, items }] in the order the curricula were attached to the
 * class. Items keep the order they came in (the class's sequence order).
 */
export function groupClassQuestsByCurriculum(items, rowOf = (item) => item) {
  const loose = []
  const sections = new Map()
  for (const item of items || []) {
    const row = rowOf(item) || {}
    const title = row.curriculum_title
    if (!title) {
      loose.push(item)
      continue
    }
    const key = row.curriculum_id || title
    if (!sections.has(key)) {
      sections.set(key, {
        key,
        title,
        rank: typeof row.curriculum_rank === 'number' ? row.curriculum_rank : Number.MAX_SAFE_INTEGER,
        items: [],
      })
    }
    sections.get(key).items.push(item)
  }
  const ordered = [...sections.values()].sort(
    (a, b) => a.rank - b.rank || a.title.localeCompare(b.title),
  )
  return { loose, sections: ordered }
}
