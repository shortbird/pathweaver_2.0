/**
 * Every cache key for a student-scoped read carries the scope. Two children's
 * copies of the same quest, dashboard or document must never share an entry:
 * switching children on the family dashboard would otherwise serve the
 * previous child's tasks from cache, the exact bleed the old act-as flow hid
 * behind a full page reload.
 */
import { describe, it, expect } from 'vitest'
import { queryKeys } from './queryKeys'

describe('query keys carry the family scope', () => {
  it.each([
    ['quests.detail', (s) => queryKeys.quests.detail('q1', s)],
    ['quests.tasks', (s) => queryKeys.quests.tasks('q1', s)],
    ['quests.engagement', (s) => queryKeys.quests.engagement('q1', s)],
    ['evidence.task', (s) => queryKeys.evidence.task('t1', s)],
    ['user.engagement', (s) => queryKeys.user.engagement(s)],
  ])('%s differs across two children and the parent themselves', (_name, key) => {
    const me = key(undefined)
    const a = key('kid-a')
    const b = key('kid-b')
    expect(a).not.toEqual(b)
    expect(a).not.toEqual(me)
    expect(me.at(-1)).toBe('me')
  })

  it('detailAll is the prefix every scope\'s copy of one quest shares', () => {
    const prefix = queryKeys.quests.detailAll('q1')
    expect(queryKeys.quests.detail('q1', 'kid-a').slice(0, prefix.length)).toEqual(prefix)
    expect(queryKeys.quests.detail('q1').slice(0, prefix.length)).toEqual(prefix)
  })
})
