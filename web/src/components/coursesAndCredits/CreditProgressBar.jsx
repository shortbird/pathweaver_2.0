import React from 'react'
import { number, string } from 'prop-types'
import { xpLabel } from './xpLabels'

/**
 * Progress toward a requirement, with XP waiting on review as a yellow
 * segment right after what is already counted (2026-09-28). The yellow is
 * capped at what is left of the bar, and its amount is in the tooltip and
 * for screen readers, since the page no longer says it in a line of text.
 */
const CreditProgressBar = ({ earnedPercent, pendingXp = 0, requiredXp, height = 'h-2', fillClass = 'bg-gradient-primary' }) => {
  const earned = Math.max(0, Math.min(100, earnedPercent || 0))
  const pendingPercent = requiredXp > 0 && pendingXp > 0
    ? Math.min(100 - earned, (pendingXp / requiredXp) * 100)
    : 0
  const pendingText = `${xpLabel(pendingXp)} waiting on review`

  return (
    <div className={`w-full ${height} bg-gray-100 rounded-full overflow-hidden flex`}>
      {/* Rounded on its own only when nothing sits after it. */}
      <div className={`h-full ${fillClass}${pendingPercent > 0 ? '' : ' rounded-full'}`} style={{ width: `${earned}%` }} />
      {pendingPercent > 0 && (
        <div
          className="h-full bg-yellow-400"
          style={{ width: `${pendingPercent}%` }}
          title={pendingText}
          role="img"
          aria-label={pendingText}
        />
      )}
    </div>
  )
}

CreditProgressBar.propTypes = {
  earnedPercent: number,
  pendingXp: number,
  requiredXp: number,
  height: string,
  fillClass: string,
}

export default CreditProgressBar
