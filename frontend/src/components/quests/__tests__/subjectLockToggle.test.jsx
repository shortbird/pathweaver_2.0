import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * The "only these subjects" lock.
 *
 * Finn O'Neill, 2026-09-07: generating tasks for the three credits he still
 * needed kept producing half-and-half splits, "so I would not really know how
 * much I'd be getting... it's hard to tell." The prompt only ever asked the AI
 * for a 70% majority; this is the control that makes it exact.
 */

import SubjectLockToggle from '../SubjectLockToggle'

describe('SubjectLockToggle', () => {
  it('names the subjects it will lock to, so the promise is specific', () => {
    render(
      <SubjectLockToggle checked={false} onChange={vi.fn()} subjectNames="Fine Arts" />
    )

    expect(screen.getByText(/Every task earns credit in Fine Arts/)).toBeInTheDocument()
  })

  it('reports the new value when toggled', () => {
    const onChange = vi.fn()
    render(
      <SubjectLockToggle checked={false} onChange={onChange} subjectNames="Social Studies" />
    )

    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('reflects the on state', () => {
    render(
      <SubjectLockToggle checked onChange={vi.fn()} subjectNames="Social Studies" />
    )

    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})
