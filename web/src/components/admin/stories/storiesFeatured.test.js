import { describe, it, expect } from 'vitest'
import { nextLineup, homeLineup, featuredFirst } from '../StoriesManager'

const stories = (ranks) => ranks.map((featured_rank, i) => ({ id: `s${i + 1}`, featured_rank }))

describe('nextLineup', () => {
  it('puts a story in an empty lineup', () => {
    expect(nextLineup(stories([null, null]), 's2', 1)).toEqual(['s2'])
  })

  it('takes the slot from whoever held it', () => {
    expect(nextLineup(stories([1, 2, null]), 's3', 2)).toEqual(['s1', 's3'])
  })

  it('moves a story between slots', () => {
    expect(nextLineup(stories([1, 2, 3]), 's1', 3)).toEqual(['s2', 's1'])
  })

  it('closes the gap when a story comes off', () => {
    expect(nextLineup(stories([1, 2, 3]), 's2', 0)).toEqual(['s1', 's3'])
  })
})

describe('homeLineup', () => {
  const pub = (id, featured_rank, published_at) => ({ id, status: 'published', featured_rank, published_at })

  it('puts the picks first, then fills with the newest', () => {
    const stories = [
      pub('old', null, '2026-09-01'),
      pub('new', null, '2026-09-20'),
      pub('p2', 2, '2026-08-01'),
      pub('p1', 1, '2026-08-02'),
      { id: 'draft', status: 'review', featured_rank: null, published_at: '2026-09-22' },
    ]
    expect(homeLineup(stories).map(e => [e.story.id, e.picked])).toEqual([
      ['p1', true], ['p2', true], ['new', false],
    ])
  })
})

describe('featuredFirst', () => {
  it('lists the featured stories at the top in slot order', () => {
    const stories = [{ id: 'a' }, { id: 'b', featured_rank: 2 }, { id: 'c' }, { id: 'd', featured_rank: 1 }]
    expect(featuredFirst(stories).map(s => s.id)).toEqual(['d', 'b', 'a', 'c'])
  })
})
