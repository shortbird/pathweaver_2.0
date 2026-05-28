import { describe, it, expect } from 'vitest'
import {
  computeEvidenceDiff,
  summarizeDiff,
  DIFF_NEW,
  DIFF_MODIFIED,
  DIFF_UNCHANGED,
} from './evidenceDiff'

const block = (id, type, content) => ({ id, block_type: type, content })

describe('computeEvidenceDiff', () => {
  it('returns no baseline when fewer than 2 rounds exist', () => {
    const result = computeEvidenceDiff(
      [block('a', 'text', { text: 'hi' })],
      [{ round_number: 1, evidence_snapshot: [] }],
    )
    expect(result.hasBaseline).toBe(false)
    expect(result.diffStatus).toEqual({})
    expect(result.removedBlocks).toEqual([])
  })

  it('classifies added, modified, unchanged and removed blocks between rounds', () => {
    const previousSnapshot = [
      block('a', 'text', { text: 'original' }),
      block('b', 'text', { text: 'kept as-is' }),
      block('c', 'link', { url: 'https://old.example.com' }),
    ]
    const current = [
      block('a', 'text', { text: 'edited reply to feedback' }), // modified
      block('b', 'text', { text: 'kept as-is' }), // unchanged
      block('d', 'image', { url: 'https://img.example.com/new.png' }), // new
      // 'c' was removed
    ]
    const rounds = [
      { round_number: 1, evidence_snapshot: previousSnapshot, reviewer_action: 'grow_this' },
      { round_number: 2, evidence_snapshot: current },
    ]

    const result = computeEvidenceDiff(current, rounds)
    expect(result.hasBaseline).toBe(true)
    expect(result.baselineRoundNumber).toBe(1)
    expect(result.diffStatus).toEqual({
      a: DIFF_MODIFIED,
      b: DIFF_UNCHANGED,
      d: DIFF_NEW,
    })
    expect(result.previousById.a).toEqual(previousSnapshot[0])
    expect(result.removedBlocks).toEqual([previousSnapshot[2]])
  })

  it('uses the second-to-last round as the baseline even when rounds arrive unsorted', () => {
    const round1Snapshot = [block('a', 'text', { text: 'v1' })]
    const round2Snapshot = [block('a', 'text', { text: 'v2' })]
    const round3Current = [block('a', 'text', { text: 'v3' })]
    const rounds = [
      { round_number: 3, evidence_snapshot: round3Current },
      { round_number: 1, evidence_snapshot: round1Snapshot },
      { round_number: 2, evidence_snapshot: round2Snapshot, reviewer_action: 'grow_this' },
    ]

    const result = computeEvidenceDiff(round3Current, rounds)
    expect(result.baselineRoundNumber).toBe(2)
    expect(result.diffStatus).toEqual({ a: DIFF_MODIFIED })
    expect(result.previousById.a.content.text).toBe('v2')
  })
})

describe('summarizeDiff', () => {
  it('counts added / modified / removed', () => {
    const counts = summarizeDiff(
      { a: DIFF_NEW, b: DIFF_NEW, c: DIFF_MODIFIED, d: DIFF_UNCHANGED },
      [{ id: 'x' }, { id: 'y' }],
    )
    expect(counts).toEqual({ added: 2, modified: 1, removed: 2 })
  })
})
