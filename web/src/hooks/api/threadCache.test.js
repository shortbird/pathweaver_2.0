/**
 * The three send-in-flight rules. Each one is a symptom that was reported:
 * a message shown twice, a message that vanished after send, a sender who
 * sent again because of it.
 */
import { describe, it, expect } from 'vitest'
import { mergeThreadPage, appendRealtimeMessage, settleOptimistic } from './threadCache'

const row = (id, extra = {}) => ({ id, sender_id: 'me', message_content: `m${id}`, created_at: new Date().toISOString(), ...extra })
const bubble = (id, content) => row(id, { message_content: content, isOptimistic: true })

describe('mergeThreadPage', () => {
  it('keeps the optimistic bubble a stale poll does not know about', () => {
    const local = [row('a'), bubble('temp-1', 'hi')]
    const merged = mergeThreadPage(local, [row('a')])
    expect(merged.map((m) => m.id)).toEqual(['a', 'temp-1'])
  })

  it('keeps a just-saved row the page missed, but not an old one', () => {
    const old = row('gone', { created_at: '2020-01-01T00:00:00Z' })
    const merged = mergeThreadPage([row('a'), row('b'), old], [row('a')])
    expect(merged.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('lets the page win for rows it carries', () => {
    const merged = mergeThreadPage([row('a', { read_at: null })], [row('a', { read_at: 'now' })])
    expect(merged[0].read_at).toBe('now')
  })
})

describe('appendRealtimeMessage', () => {
  it('replaces the sender\'s own bubble when the broadcast beats the response', () => {
    const next = appendRealtimeMessage([row('a'), bubble('temp-1', 'hi')], row('saved', { message_content: 'hi' }))
    expect(next.map((m) => m.id)).toEqual(['a', 'saved'])
    expect(next[1].isOptimistic).toBe(false)
  })

  it('appends someone else\'s message and ignores a duplicate id', () => {
    const list = [row('a')]
    const next = appendRealtimeMessage(list, row('b', { sender_id: 'them' }))
    expect(next.map((m) => m.id)).toEqual(['a', 'b'])
    expect(appendRealtimeMessage(next, row('b'))).toBe(next)
  })
})

describe('settleOptimistic', () => {
  it('turns the bubble into the saved row in place', () => {
    const next = settleOptimistic([row('a'), bubble('temp-1', 'hi')], 'temp-1', row('saved', { message_content: 'hi' }))
    expect(next.map((m) => m.id)).toEqual(['a', 'saved'])
    expect(next[1].isOptimistic).toBe(false)
  })

  it('drops the bubble when the broadcast already delivered the row', () => {
    const next = settleOptimistic([row('a'), row('saved'), bubble('temp-1', 'hi')], 'temp-1', row('saved'))
    expect(next.map((m) => m.id)).toEqual(['a', 'saved'])
  })

  it('appends the saved row when a stale poll already erased the bubble', () => {
    const next = settleOptimistic([row('a')], 'temp-1', row('saved'))
    expect(next.map((m) => m.id)).toEqual(['a', 'saved'])
  })
})
