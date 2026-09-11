import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import FilterBar from './FilterBar'

/**
 * The student box searches by name. It used to send the typed text as a
 * student_id, which the API compared to the uuid, so nothing ever matched.
 * It also waits for the reviewer to stop typing: the queue refetches on
 * every filter change.
 */
const FILTERS = { status: '', student: '', subject: '', date_from: '', date_to: '', ai: '' }

const apply = (onFiltersChange) => {
  let state = { ...FILTERS }
  onFiltersChange.mock.calls.forEach(([updater]) => { state = updater(state) })
  return state
}

describe('FilterBar student search', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sends the name under `student` after the reviewer pauses', () => {
    const onFiltersChange = vi.fn()
    render(<FilterBar filters={FILTERS} onFiltersChange={onFiltersChange} />)
    const box = screen.getByRole('searchbox', { name: 'Search student' })
    fireEvent.change(box, { target: { value: 'Sam' } })
    fireEvent.change(box, { target: { value: 'Sam Pe' } })
    expect(onFiltersChange).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(300) })
    expect(onFiltersChange).toHaveBeenCalledTimes(1)
    expect(apply(onFiltersChange)).toMatchObject({ student: 'Sam Pe' })
    expect(apply(onFiltersChange)).not.toHaveProperty('student_id')
  })

  it('shows the settled value the page holds', () => {
    render(<FilterBar filters={{ ...FILTERS, student: 'Penny' }} onFiltersChange={vi.fn()} />)
    expect(screen.getByRole('searchbox', { name: 'Search student' })).toHaveValue('Penny')
  })
})
