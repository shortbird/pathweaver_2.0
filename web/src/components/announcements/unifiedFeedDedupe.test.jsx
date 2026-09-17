import { describe, it, expect } from 'vitest'
import { feedItems } from './UnifiedFeed'

/**
 * A board post created with "notify" writes an archive row too, so the same
 * words reach the family feed twice. Which copy is which used to be guessed
 * here -- from title + calendar day, which broke the moment someone edited the
 * post (iCreate, 2026-08-27), then from the link column, while the phone kept
 * guessing. Since M1 (docs/sis/CONSOLIDATION_PLAN.md) the server says: an
 * archive row whose source post is on the board right now arrives with
 * `on_board: true`, and this component renders what is not. No heuristic, on
 * either client.
 */
describe('feedItems', () => {
  const board = (over = {}) => ({
    id: 'board-1', title: 'Picture day', created_at: '2026-08-27T10:00:00Z', ...over,
  })
  const msg = (over = {}) => ({
    id: 'sent-1', title: 'Picture day', created_at: '2026-08-27T10:00:01Z', ...over,
  })

  it('renders the board copy and not the receipt the server marked', () => {
    const items = feedItems({ announcements: [board()] },
      [msg({ source_announcement_id: 'board-1', on_board: true })])
    expect(items.map((i) => i.kind)).toEqual(['announcement'])
  })

  it('does not care what the titles say', () => {
    // The whole reason: an edited title used to turn one notice into two.
    const items = feedItems({ announcements: [board({ title: 'Picture day (moved)' })] },
      [msg({ title: 'Picture day', source_announcement_id: 'board-1', on_board: true })])
    expect(items).toHaveLength(1)
    expect(items[0].data.title).toBe('Picture day (moved)')
  })

  it('shows a send whose post has left the board, so an old notice stays findable', () => {
    const items = feedItems({ announcements: [] },
      [msg({ source_announcement_id: 'board-1', on_board: false })])
    expect(items.map((i) => i.kind)).toEqual(['message'])
  })

  it('keeps a standalone Messaging-page send, same title or not', () => {
    const items = feedItems({ announcements: [board()] }, [msg({ id: 'sent-3' })])
    expect(items).toHaveLength(2)
  })

  it('pinned board posts sort to the top', () => {
    const items = feedItems(
      { announcements: [board({ id: 'b2', title: 'Old', created_at: '2026-08-01T00:00:00Z', pinned: true })] },
      [msg({ id: 'sent-9', title: 'Newer' })])
    expect(items[0].data.title).toBe('Old')
  })
})
