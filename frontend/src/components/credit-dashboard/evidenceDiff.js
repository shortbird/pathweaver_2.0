export const DIFF_NEW = 'new'
export const DIFF_MODIFIED = 'modified'
export const DIFF_UNCHANGED = 'unchanged'
export const DIFF_REMOVED = 'removed'

const deepEqual = (a, b) => {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false
    return true
  }
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false
  return true
}

const sameBlock = (a, b) =>
  a.block_type === b.block_type && deepEqual(a.content, b.content)

// Given live blocks and the completion's review rounds, classify each current
// block as new / modified / unchanged relative to the previous submission, and
// surface blocks that were in the previous snapshot but are no longer present.
// "Previous submission" = the round just before the current one (sorted by
// round_number). With <2 rounds, there's nothing to compare so the result is
// empty and hasBaseline is false.
export function computeEvidenceDiff(currentBlocks, reviewRounds) {
  const blocks = Array.isArray(currentBlocks) ? currentBlocks : []
  const rounds = Array.isArray(reviewRounds) ? reviewRounds : []
  if (rounds.length < 2) {
    return { diffStatus: {}, removedBlocks: [], previousById: {}, hasBaseline: false }
  }
  const sorted = [...rounds].sort(
    (a, b) => (a.round_number || 0) - (b.round_number || 0),
  )
  const baseline = sorted[sorted.length - 2]
  const baselineBlocks = Array.isArray(baseline.evidence_snapshot)
    ? baseline.evidence_snapshot
    : []
  const baselineById = new Map()
  for (const b of baselineBlocks) if (b && b.id) baselineById.set(b.id, b)

  const diffStatus = {}
  const previousById = {}
  for (const block of blocks) {
    if (!block || !block.id) continue
    const prev = baselineById.get(block.id)
    if (!prev) {
      diffStatus[block.id] = DIFF_NEW
    } else if (!sameBlock(prev, block)) {
      diffStatus[block.id] = DIFF_MODIFIED
      previousById[block.id] = prev
    } else {
      diffStatus[block.id] = DIFF_UNCHANGED
    }
  }
  const currentIds = new Set(blocks.map(b => b && b.id).filter(Boolean))
  const removedBlocks = baselineBlocks.filter(b => b && b.id && !currentIds.has(b.id))
  return {
    diffStatus,
    removedBlocks,
    previousById,
    hasBaseline: true,
    baselineRoundNumber: baseline.round_number,
  }
}

export function summarizeDiff(diffStatus, removedBlocks) {
  let added = 0
  let modified = 0
  for (const status of Object.values(diffStatus)) {
    if (status === DIFF_NEW) added++
    else if (status === DIFF_MODIFIED) modified++
  }
  return { added, modified, removed: (removedBlocks || []).length }
}
