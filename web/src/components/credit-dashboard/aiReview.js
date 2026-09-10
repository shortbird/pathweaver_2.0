/**
 * Reading an AI credit review, without React.
 *
 * The AI proposes and a superadmin decides, so everything here is shaped around
 * making the proposal easy to disagree with: the criteria come from the TASK and
 * the AI only fills in verdicts, the XP figure is a suggestion until somebody
 * clicks it, and a review that never ran renders as nothing rather than as an
 * absence of problems.
 *
 * Null-safe throughout on purpose. Org admins get a payload with no `ai` key at
 * all (the backend omits it), and so does any client running against a backend
 * that predates the feature.
 */

export const AI_ACTION_META = {
  approve: {
    label: 'Approve',
    className: 'bg-emerald-100 text-emerald-800',
    sentence: 'recommends approving this',
  },
  grow_this: {
    label: 'Grow This',
    className: 'bg-orange-100 text-orange-800',
    sentence: 'recommends returning this for more',
  },
  needs_human: {
    label: 'Needs human',
    className: 'bg-amber-100 text-amber-900',
    sentence: 'could not judge this and wants a person to read it',
  },
}

export const AI_STATUS_META = {
  not_run: { label: null, className: '', sentence: 'has not looked at this' },
  queued: { label: 'AI queued', className: 'bg-gray-100 text-gray-600', sentence: 'is queued to read this' },
  running: { label: 'AI reading', className: 'bg-gray-100 text-gray-600', sentence: 'is reading this now' },
  failed: { label: 'AI failed', className: 'bg-red-100 text-red-800', sentence: 'could not finish' },
  skipped: { label: 'AI off', className: 'bg-gray-100 text-gray-500', sentence: 'is turned off for this student' },
}

/**
 * Per-criterion verdicts.
 *
 * Every one carries `srText` because colour alone is not a status: a reviewer
 * using a screen reader, or anyone red-green colourblind, must get the same
 * answer from the same row.
 */
export const CRITERION_STATUS_META = {
  met: { symbol: '✓', className: 'text-emerald-600', srText: 'Met', label: 'Met' },
  partial: { symbol: '~', className: 'text-amber-600', srText: 'Partly met', label: 'Partly met' },
  not_met: { symbol: '✕', className: 'text-red-600', srText: 'Not met', label: 'Not met' },
  cannot_verify: { symbol: '?', className: 'text-gray-400', srText: 'Could not check', label: 'Could not check' },
  unassessed: { symbol: '·', className: 'text-gray-300', srText: 'Not assessed', label: 'Not assessed' },
}

const TERMINAL_STATUSES = ['complete', 'failed', 'skipped', 'not_run']

export const isTerminalAiStatus = (status) =>
  !status || TERMINAL_STATUSES.includes(status)

export const isRunningAiStatus = (status) =>
  status === 'queued' || status === 'running'

/**
 * The AI review attached to a detail payload.
 *
 * Falls back to deriving it from the newest review round, so the UI works
 * against a backend that carries the columns but not the top-level object.
 * Returns a not_run shape rather than null, so callers never branch on absence.
 */
export const latestAi = (detail) => {
  if (!detail) return { status: 'not_run' }
  if (detail.ai) return detail.ai

  const rounds = detail.review_rounds || []
  if (!rounds.length) return { status: 'not_run' }
  const newest = rounds.reduce(
    (best, r) => ((r?.round_number || 0) > (best?.round_number || 0) ? r : best),
    rounds[0]
  )
  const summary = (detail.ai_by_round || {})[newest?.id]
  if (!summary) return { status: 'not_run' }
  return { status: summary.ai_status || 'not_run', review: null }
}

/** "82%" — a confidence a reviewer can weigh, not a decimal to decode. */
export const formatConfidence = (confidence) => {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) return null
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`
}

/** The badge fields, from either a list row or a detail object. */
export const aiItemSummary = (item) => {
  if (!item) return { status: 'not_run' }
  if (item.ai_status !== undefined) {
    return {
      status: item.ai_status || 'not_run',
      action: item.ai_recommendation,
      confidence: item.ai_confidence,
      xpRecommended: item.ai_xp_recommended,
    }
  }
  const review = item.review || {}
  return {
    status: item.status || 'not_run',
    action: review.recommendation,
    confidence: review.confidence,
    xpRecommended: review.xp?.changed ? review.xp.recommended : null,
  }
}

export const sumSubjects = (subjects) =>
  Object.values(subjects || {}).reduce((total, xp) => total + (parseInt(xp, 10) || 0), 0)

/**
 * The same subject split, re-weighted to a new total.
 *
 * Multiples of five, summing exactly, with the rounding difference absorbed by
 * the largest subject — the same rules utils/subject_xp.py applies on the
 * server. Disagreeing with it would show the reviewer one split and credit
 * another.
 */
export const rescaleSubjects = (subjects, newTotal) => {
  const entries = Object.entries(subjects || {})
    .map(([subject, xp]) => [subject, parseInt(xp, 10) || 0])
    .filter(([, xp]) => xp > 0)

  const total = entries.reduce((sum, [, xp]) => sum + xp, 0)
  if (!entries.length || total <= 0 || !newTotal || newTotal <= 0) return {}

  const scaled = {}
  entries.forEach(([subject, xp]) => {
    scaled[subject] = Math.max(5, 5 * Math.round((xp * newTotal) / total / 5))
  })

  const diff = newTotal - sumSubjects(scaled)
  if (diff !== 0) {
    const largest = Object.entries(scaled).sort((a, b) => b[1] - a[1])[0][0]
    scaled[largest] = Math.max(5, scaled[largest] + diff)
  }
  return scaled
}

/**
 * The Definition of Done, with the AI's verdict against each line.
 *
 * The criterion TEXT always comes from the task. The AI supplies a verdict and a
 * note; it does not get to restate what it was asked to check, because a
 * reviewer scanning the list has to be reading the school's standard rather than
 * the model's paraphrase of it.
 */
export const criteriaForDisplay = (task, aiReview) => {
  const taskCriteria = Array.isArray(task?.success_criteria) ? task.success_criteria : []
  const aiCriteria = Array.isArray(aiReview?.criteria) ? aiReview.criteria : []
  const byIndex = new Map(aiCriteria.map(c => [c.index, c]))

  // A task with no written criteria is judged against its description, and the
  // AI's own text is then all there is. Labelled as such wherever it renders.
  const source = aiReview?.criteria_source
  const base = taskCriteria.length
    ? taskCriteria
    : aiCriteria.map(c => c.criterion).filter(Boolean)

  return base.map((text, i) => {
    const index = i + 1
    const found = byIndex.get(index)
    return {
      index,
      text,
      status: found?.verdict || (aiCriteria.length ? 'unassessed' : null),
      note: found?.note || null,
      evidenceRefs: found?.evidence_refs || [],
      inferred: source === 'task_description',
    }
  })
}

/** The DOM id an evidence card carries, so a citation can jump to it. */
export const evidenceAnchorId = (key) => `evidence-block-${key}`

/**
 * Which evidence card an [E<n>] citation points at.
 *
 * Prefers the block id recorded when the AI read it, because a reviewer can add
 * or remove evidence between the review running and them opening it, and the
 * position would then point at the wrong card. Falls back to position.
 */
export const resolveEvidenceRef = (refIndex, aiReview, evidenceBlocks) => {
  const manifest = Array.isArray(aiReview?.evidence) ? aiReview.evidence : []
  const entry = manifest.find(e => e.index === refIndex)
  const blocks = evidenceBlocks || []
  if (entry?.block_id && blocks.some(b => b.id === entry.block_id)) {
    return entry.block_id
  }
  return blocks[refIndex - 1]?.id || null
}
