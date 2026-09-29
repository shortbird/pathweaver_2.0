import React, { useState } from 'react'

import { isXpSize, snapXp, stepXp } from './xpSizes'

/**
 * A number box whose arrows move between the task sizes (25, 50, 75, 100, 150,
 * 200) and nothing else.
 *
 * The native spinner is kept, because it is what a reviewer reaches for, with
 * step 1: a spinner click then changes the value by exactly one, which is how
 * it is told apart from typing and turned into a jump to the next size. The
 * arrow keys do the same. Typing is free while the box has focus -- "1", "15",
 * "150" -- and a size is taken the moment one is typed; anything else snaps to
 * the nearest size on blur or Enter.
 *
 * `value` may be a legacy claim off the scale (120). It shows as it is, and the
 * arrows move from it to 100 or 150.
 */
const XpSizeInput = ({ value, onChange, className = '', ...rest }) => {
  const [draft, setDraft] = useState(String(value ?? ''))
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    // A value that arrived from elsewhere (the AI, a revert) replaces the draft.
    setSeen(value)
    setDraft(String(value ?? ''))
  }

  const current = Number(value)

  const pick = (next) => {
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  const handleChange = (e) => {
    const raw = e.target.value
    const n = parseInt(raw, 10)
    if (!Number.isNaN(n) && Math.abs(n - current) === 1 && !isXpSize(n)) {
      pick(stepXp(current, n > current ? 1 : -1))
      return
    }
    setDraft(raw)
    if (isXpSize(n)) pick(n)
  }

  const commit = () => {
    const n = parseInt(draft, 10)
    if (n === current) return
    const snapped = snapXp(draft)
    if (snapped == null) { setDraft(String(value ?? '')); return }
    pick(snapped)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      pick(stepXp(current, e.key === 'ArrowUp' ? 1 : -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    }
  }

  return (
    <input
      type="number"
      min={25}
      max={200}
      step={1}
      inputMode="numeric"
      value={draft}
      onChange={handleChange}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      className={className}
      {...rest}
    />
  )
}

export default XpSizeInput
