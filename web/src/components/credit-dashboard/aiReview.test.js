import { describe, it, expect } from 'vitest'
import {
  aiItemSummary,
  criteriaForDisplay,
  formatConfidence,
  isRunningAiStatus,
  latestAi,
  rescaleSubjects,
  resolveEvidenceRef,
  sumSubjects,
} from './aiReview'

describe('rescaleSubjects', () => {
  // The server rounds subject splits to fives and makes them sum exactly
  // (utils/subject_xp.py). Showing a reviewer one split and crediting another is
  // how the two drift, so this has to agree with it.
  it('sums exactly to the new total', () => {
    expect(sumSubjects(rescaleSubjects({ science: 120, math: 80 }, 100))).toBe(100)
  })

  it('keeps every value a multiple of five', () => {
    const out = rescaleSubjects({ science: 133, math: 67, health: 50 }, 175)
    expect(Object.values(out).every(v => v % 5 === 0)).toBe(true)
    expect(sumSubjects(out)).toBe(175)
  })

  it('keeps the proportions', () => {
    const out = rescaleSubjects({ science: 150, math: 50 }, 100)
    expect(out.science).toBeGreaterThan(out.math)
  })

  it('gives a single subject the whole total', () => {
    expect(rescaleSubjects({ science: 200 }, 75)).toEqual({ science: 75 })
  })

  it('returns nothing for an empty split or a zero total', () => {
    expect(rescaleSubjects({}, 100)).toEqual({})
    expect(rescaleSubjects({ science: 100 }, 0)).toEqual({})
  })
})

describe('latestAi', () => {
  it('returns a not_run shape rather than null', () => {
    expect(latestAi(null).status).toBe('not_run')
    expect(latestAi({}).status).toBe('not_run')
  })

  it('prefers the payload the backend attached', () => {
    expect(latestAi({ ai: { status: 'complete' } }).status).toBe('complete')
  })

  it('falls back to the newest round when only the map is present', () => {
    const detail = {
      review_rounds: [{ id: 'r1', round_number: 1 }, { id: 'r2', round_number: 2 }],
      ai_by_round: { r1: { ai_status: 'failed' }, r2: { ai_status: 'complete' } },
    }
    expect(latestAi(detail).status).toBe('complete')
  })
})

describe('criteriaForDisplay', () => {
  const aiReview = {
    criteria: [
      { index: 1, verdict: 'met', evidence_refs: [1], note: 'Shown.' },
      { index: 2, verdict: 'not_met', evidence_refs: [], note: 'Missing.' },
    ],
  }

  it('takes the criterion text from the task, never from the model', () => {
    const rows = criteriaForDisplay(
      { success_criteria: ['Built it', 'Tested it'] },
      { criteria: [{ index: 1, verdict: 'met', criterion: 'Something else' }] },
    )
    expect(rows[0].text).toBe('Built it')
  })

  it('pairs each criterion with its verdict', () => {
    const rows = criteriaForDisplay({ success_criteria: ['A', 'B'] }, aiReview)
    expect(rows.map(r => r.status)).toEqual(['met', 'not_met'])
  })

  it('marks a criterion the AI skipped as not assessed', () => {
    const rows = criteriaForDisplay(
      { success_criteria: ['A', 'B', 'C'] }, aiReview)
    expect(rows[2].status).toBe('unassessed')
  })

  it('leaves the status null when there is no review at all', () => {
    const rows = criteriaForDisplay({ success_criteria: ['A'] }, null)
    expect(rows[0].status).toBeNull()
  })

  it('uses the inferred criteria when the task set none', () => {
    const rows = criteriaForDisplay(
      { success_criteria: [] },
      { criteria_source: 'task_description',
        criteria: [{ index: 1, criterion: 'Do the thing', verdict: 'met' }] },
    )
    expect(rows[0].text).toBe('Do the thing')
    expect(rows[0].inferred).toBe(true)
  })
})

describe('resolveEvidenceRef', () => {
  const blocks = [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }]

  it('uses the block the AI actually read', () => {
    const review = { evidence: [{ index: 1, block_id: 'b2' }] }
    expect(resolveEvidenceRef(1, review, blocks)).toBe('b2')
  })

  it('falls back to position when the recorded block is gone', () => {
    // A reviewer can add or remove evidence between the review running and them
    // opening it, and a stale id would point at nothing.
    const review = { evidence: [{ index: 1, block_id: 'deleted' }] }
    expect(resolveEvidenceRef(1, review, blocks)).toBe('b1')
  })

  it('returns null for a citation with no matching card', () => {
    expect(resolveEvidenceRef(9, {}, blocks)).toBeNull()
  })
})

describe('aiItemSummary', () => {
  it('reads a queue row', () => {
    expect(aiItemSummary({
      ai_status: 'complete', ai_recommendation: 'approve', ai_confidence: 0.9,
    })).toMatchObject({ status: 'complete', action: 'approve', confidence: 0.9 })
  })

  it('reads a per-round summary object', () => {
    expect(aiItemSummary({
      status: 'complete', review: { recommendation: 'grow_this', confidence: 0.5 },
    })).toMatchObject({ status: 'complete', action: 'grow_this' })
  })

  it('reports not_run for nothing at all', () => {
    expect(aiItemSummary(null).status).toBe('not_run')
  })
})

describe('formatConfidence', () => {
  it('renders a percentage a reviewer can weigh', () => {
    expect(formatConfidence(0.824)).toBe('82%')
  })

  it('returns nothing for a missing value', () => {
    expect(formatConfidence(undefined)).toBeNull()
    expect(formatConfidence('high')).toBeNull()
  })
})

describe('isRunningAiStatus', () => {
  it('is true only while there is something to wait for', () => {
    expect(isRunningAiStatus('queued')).toBe(true)
    expect(isRunningAiStatus('running')).toBe(true)
    expect(isRunningAiStatus('complete')).toBe(false)
    expect(isRunningAiStatus('failed')).toBe(false)
    expect(isRunningAiStatus(undefined)).toBe(false)
  })
})
