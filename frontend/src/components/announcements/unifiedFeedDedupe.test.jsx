import { describe, it, expect } from 'vitest'
import { mergeFeedItems } from './UnifiedFeed'

/**
 * A board post created with "notify" writes an archive row too, so the same
 * words reach the family feed twice. Which copy is which used to be guessed
 * from title + calendar day — and that guess broke the moment someone edited
 * the post, showing the family two of a notice the admin had written once
 * (iCreate, 2026-08-27). The archive row now carries the board post's id.
 */
describe('mergeFeedItems', () => {
  const board = (over = {}) => ({
    id: 'board-1', title: 'Picture day', created_at: '2026-08-27T10:00:00Z', ...over,
  })
  const msg = (over = {}) => ({
    id: 'sent-1', title: 'Picture day', created_at: '2026-08-27T10:00:01Z', ...over,
  })

  it('drops the archive copy of a board post it is linked to', () => {
    const items = mergeFeedItems({ announcements: [board()] },
      [msg({ source_announcement_id: 'board-1' })])
    expect(items.map((i) => i.kind)).toEqual(['announcement'])
  })

  it('still drops it after the board post title was edited', () => {
    const items = mergeFeedItems({ announcements: [board({ title: 'Picture day (moved)' })] },
      [msg({ source_announcement_id: 'board-1' })])
    expect(items).toHaveLength(1)
    expect(items[0].data.title).toBe('Picture day (moved)')
  })

  it('keeps a send that came from a different board post', () => {
    const items = mergeFeedItems({ announcements: [board()] },
      [msg({ id: 'sent-2', title: 'Bus change', source_announcement_id: 'board-2' })])
    expect(items.map((i) => i.kind).sort()).toEqual(['announcement', 'message'])
  })

  it('falls back to title and day for sends that predate the link', () => {
    const items = mergeFeedItems({ announcements: [board()] }, [msg()])
    expect(items.map((i) => i.kind)).toEqual(['announcement'])
  })

  it('keeps a standalone Messaging-page send', () => {
    const items = mergeFeedItems({ announcements: [board()] },
      [msg({ id: 'sent-3', title: 'Early dismissal' })])
    expect(items).toHaveLength(2)
  })

  it('pinned board posts sort to the top', () => {
    const items = mergeFeedItems(
      { announcements: [board({ id: 'b2', title: 'Old', created_at: '2026-08-01T00:00:00Z', pinned: true })] },
      [msg({ id: 'sent-9', title: 'Newer' })])
    expect(items[0].data.title).toBe('Old')
  })
})
