import React from 'react'

/**
 * Who wrote the task under review, and how its claimed XP compares with the
 * size the AI gave it when it was written.
 *
 * Families (a parent working as their child, or the student) write their own
 * tasks and, at most schools, pick the XP. `ai_suggested_xp` is the AI's size
 * for that task, filled in the background just after it was created, so it is
 * the independent number a reviewer can hold the claim against. It is null for
 * tasks nobody in the family wrote, and for ones the sizing never finished.
 *
 * Only a signal, never a verdict: the reviewer decides. The threshold is one
 * step on the XP scale (25/50/75/100/150/200) past "close enough".
 */
export const XP_INFLATION_GAP = 50

const WRITERS = { parent: 'parent', student: 'student' }

const asNumber = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null)

export const isXpInflated = (xpValue, aiSuggestedXp) => {
  const claimed = asNumber(xpValue)
  const sized = asNumber(aiSuggestedXp)
  if (claimed === null || sized === null) return false
  return claimed - sized >= XP_INFLATION_GAP
}

/** "Written by parent · 200 XP claimed · AI sized it at 75 when created", or null. */
export const taskOriginLine = ({ writtenBy, xpValue, aiSuggestedXp }) => {
  const writer = WRITERS[writtenBy]
  if (!writer) return null
  const parts = [`Written by ${writer}`]
  const claimed = asNumber(xpValue)
  if (claimed !== null) parts.push(`${claimed} XP claimed`)
  const sized = asNumber(aiSuggestedXp)
  if (sized !== null) parts.push(`AI sized it at ${sized} when created`)
  return parts.join(' · ')
}

export const XpInflationBadge = ({ xpValue, aiSuggestedXp }) => {
  if (!isXpInflated(xpValue, aiSuggestedXp)) return null
  return (
    <span
      className="inline-flex rounded-full font-medium whitespace-nowrap text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800"
      title="The family claimed more XP than the AI sized this task at when it was written"
      data-testid="xp-inflation-badge"
    >
      XP {asNumber(xpValue)} vs {asNumber(aiSuggestedXp)}
    </span>
  )
}
