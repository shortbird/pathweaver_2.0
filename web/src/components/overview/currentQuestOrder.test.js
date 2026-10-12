import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  compareDue,
  CURRENT_COMPARE,
  groupCurrentQuests,
  pickNextUpTasks,
  readStoredSort,
  writeStoredSort,
  SORT_STORAGE_KEY,
} from './currentQuestOrder'

/**
 * Ticket 4cc854cd (iCreate, approved by the owner): "Is there a way to see
 * the quests by class as a student? Or to see them grouped here by class? We
 * still wanted to have these be able to be sorted. By date, order of quest,
 * class, priority. On up next, idk how that prioritizes the tasks."
 */

const CLASS = { id: 'indep', name: 'Independent study', enrolled: true }

const quest = (id, { title = id, due = null, cls = null, curriculum = null, rank = null,
  pos = null, classPos = null, activity = null, tasks = [] } = {}) => ({
  quest_id: id,
  last_activity_at: activity,
  class_assignment: due ? { due_date: due } : null,
  source_class: cls ? {
    ...cls, curriculum_id: curriculum ? `cur-${curriculum}` : null, curriculum_title: curriculum,
    curriculum_rank: rank, curriculum_position: pos, class_position: classPos,
  } : null,
  quests: { id, title, quest_tasks: tasks },
})

const task = (id, pillar, extra = {}) => ({ id, title: id, pillar, is_completed: false, ...extra })

describe('sort comparators', () => {
  it('due date: soonest first, undated last', () => {
    const qs = [quest('none'), quest('late', { due: '2026-11-01' }), quest('soon', { due: '2026-10-14' })]
    expect([...qs].sort(compareDue).map((q) => q.quest_id)).toEqual(['soon', 'late', 'none'])
  })

  it('class order: loose class quests by class sequence, then curricula by rank and position', () => {
    const qs = [
      quest('phys-2', { cls: CLASS, curriculum: 'Physics', rank: 1, pos: 2 }),
      quest('hist-0', { cls: CLASS, curriculum: 'History', rank: 0, pos: 0 }),
      quest('own-5', { cls: CLASS, classPos: 5 }),
      quest('phys-0', { cls: CLASS, curriculum: 'Physics', rank: 1, pos: 0 }),
    ]
    expect([...qs].sort(CURRENT_COMPARE.order).map((q) => q.quest_id))
      .toEqual(['own-5', 'hist-0', 'phys-0', 'phys-2'])
  })

  it('name and recent', () => {
    const qs = [quest('b', { title: 'Beta', activity: '2026-10-01' }),
      quest('a', { title: 'Alpha', activity: '2026-09-01' })]
    expect([...qs].sort(CURRENT_COMPARE.name).map((q) => q.quest_id)).toEqual(['a', 'b'])
    expect([...qs].sort(CURRENT_COMPARE.recent).map((q) => q.quest_id)).toEqual(['b', 'a'])
  })
})

describe('groupCurrentQuests: by class, then curriculum', () => {
  it('splits a class into its curriculum sections, loose quests first', () => {
    const groups = groupCurrentQuests([
      quest('p1', { cls: CLASS, curriculum: 'Physics', rank: 1 }),
      quest('h1', { cls: CLASS, curriculum: 'History', rank: 0 }),
      quest('loose', { cls: CLASS }),
      quest('mine'),
    ])
    const indep = groups.find((g) => g.key === 'class:indep')
    expect(indep.loose.map((q) => q.quest_id)).toEqual(['loose'])
    expect(indep.sections.map((s) => s.title)).toEqual(['History', 'Physics'])
    expect(groups.find((g) => g.personal).quests.map((q) => q.quest_id)).toEqual(['mine'])
  })

  it('sorts inside each section by the chosen sort', () => {
    const groups = groupCurrentQuests([
      quest('late', { cls: CLASS, curriculum: 'Physics', rank: 0, due: '2026-12-01' }),
      quest('soon', { cls: CLASS, curriculum: 'Physics', rank: 0, due: '2026-10-20' }),
    ], 'due')
    expect(groups[0].sections[0].quests.map((q) => q.quest_id)).toEqual(['soon', 'late'])
  })
})

describe('Next Up ordering', () => {
  it('puts dated tasks first, soonest first, and still caps at four', () => {
    const picked = pickNextUpTasks([
      quest('art', { tasks: [task('t-art', 'art')] }),
      quest('late', { due: '2026-11-01', tasks: [task('t-late', 'stem')] }),
      quest('soon', { due: '2026-10-13', tasks: [task('t-soon', 'stem')] }),
      quest('civ', { tasks: [task('t-civ', 'civics')] }),
      quest('well', { tasks: [task('t-well', 'wellness')] }),
    ])
    expect(picked.map((t) => t.id)).toEqual(['t-soon', 't-late', 't-art', 't-civ'])
  })

  it("a task's own due date beats its quest's", () => {
    const picked = pickNextUpTasks([
      quest('a', { due: '2026-11-01', tasks: [task('t-a', 'stem')] }),
      quest('b', { due: '2026-12-01', tasks: [task('t-b', 'art', { due_date: '2026-10-15' })] }),
    ])
    expect(picked.map((t) => t.id)).toEqual(['t-b', 't-a'])
  })

  it('with no dates it is the old rule: one per pillar first, then other quests', () => {
    const picked = pickNextUpTasks([
      quest('s1', { tasks: [task('t-s1', 'stem')] }),
      quest('s2', { tasks: [task('t-s2', 'stem')] }),
      quest('a1', { tasks: [task('t-a1', 'art')] }),
      quest('s3', { tasks: [task('t-s3', 'stem')] }),
      quest('c1', { tasks: [{ ...task('t-c1-done', 'civics'), is_completed: true }, task('t-c1', 'civics')] }),
    ])
    expect(picked.map((t) => t.id)).toEqual(['t-s1', 't-a1', 't-c1', 't-s2'])
  })

  it('undated class work comes in the class order before the student\'s own', () => {
    const picked = pickNextUpTasks([
      quest('mine', { tasks: [task('t-mine', 'art')] }),
      quest('second', { cls: CLASS, classPos: 2, tasks: [task('t-second', 'stem')] }),
      quest('first', { cls: CLASS, classPos: 1, tasks: [task('t-first', 'civics')] }),
    ])
    expect(picked.map((t) => t.id)).toEqual(['t-first', 't-second', 't-mine'])
  })
})

describe('remembered sort', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to recent and remembers a choice', () => {
    expect(readStoredSort()).toBe('recent')
    writeStoredSort('due')
    expect(readStoredSort()).toBe('due')
    localStorage.setItem(SORT_STORAGE_KEY, 'bogus')
    expect(readStoredSort()).toBe('recent')
  })

  it('survives storage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const spy2 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readStoredSort()).toBe('recent')
    expect(() => writeStoredSort('name')).not.toThrow()
    spy.mockRestore()
    spy2.mockRestore()
  })
})
