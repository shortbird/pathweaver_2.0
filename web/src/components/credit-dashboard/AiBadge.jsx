import React from 'react'
import { AI_ACTION_META, AI_STATUS_META, formatConfidence } from './aiReview'

/**
 * The AI's verdict as one pill.
 *
 * Renders nothing when there is no verdict and nothing went wrong — a queue row
 * for work submitted before this feature existed should look like it always did,
 * not like something is missing.
 *
 * The confidence is on the badge because a reviewer scanning a queue needs to
 * know which recommendations to trust before they open one. "Approve 91%" and
 * "Approve 62%" are different instructions.
 */
const AiBadge = ({ status = 'not_run', action, confidence, size = 'sm', className = '' }) => {
  const complete = status === 'complete'
  const meta = complete
    ? AI_ACTION_META[action] || AI_ACTION_META.needs_human
    : AI_STATUS_META[status] || AI_STATUS_META.not_run

  if (!meta?.label) return null

  const percent = complete ? formatConfidence(confidence) : null
  const text = complete ? `AI: ${meta.label}${percent ? ` ${percent}` : ''}` : meta.label
  const sentence = `The AI ${meta.sentence}${percent ? `, ${percent} confident` : ''}.`

  const sizing = size === 'xs'
    ? 'text-[10px] px-1.5 py-0.5'
    : 'text-[11px] md:text-[10px] px-2 py-0.5'
  const pulse = status === 'queued' || status === 'running' ? 'animate-pulse' : ''

  return (
    <span
      title={sentence}
      aria-label={sentence}
      className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${meta.className} ${sizing} ${pulse} ${className}`}
    >
      {text}
    </span>
  )
}


export default AiBadge
