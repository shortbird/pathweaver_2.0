import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ClassSummaryLine, { ageBandText, seatState, seatText } from './ClassSummaryLine'

describe('seatState', () => {
  it('reads the SIS shape', () => {
    expect(seatState({ is_full: false, spots_left: 3 })).toEqual({ kind: 'seats', left: 3, waiting: 0 })
    expect(seatState({ is_full: true, spots_left: 0, waitlist_count: 2 })).toEqual({ kind: 'full', left: 0, waiting: 2 })
    expect(seatState({ is_full: false, spots_left: null })).toEqual({ kind: 'open', left: null, waiting: 0 })
  })
  it('reads the embed shape', () => {
    expect(seatState({ open_seats: 1 })).toEqual({ kind: 'seats', left: 1, waiting: 0 })
    expect(seatState({ open_seats: 0, waitlist_count: 4 })).toEqual({ kind: 'full', left: 0, waiting: 4 })
    expect(seatState({ open_seats: null })).toEqual({ kind: 'open', left: null, waiting: 0 })
  })
})

describe('seatText', () => {
  it('says the same thing on every screen', () => {
    expect(seatText({ spots_left: 1 })).toBe('1 seat left')
    expect(seatText({ open_seats: 3 })).toBe('3 seats left')
    expect(seatText({ is_full: true })).toBe('Full — waitlist')
    expect(seatText({ is_full: true, waitlist_count: 4 })).toBe('Full — 4 waiting')
    expect(seatText({ open_seats: null })).toBe('Open enrollment')
  })
  it('has a short form for tight cells', () => {
    expect(seatText({ open_seats: 3 }, { short: true })).toBe('3 left')
    expect(seatText({ is_full: true }, { short: true })).toBe('Full')
    expect(seatText({ open_seats: null }, { short: true })).toBe('Open')
  })
})

describe('ageBandText', () => {
  it('spells the band one way', () => {
    expect(ageBandText({ min_age: 5, max_age: 9 })).toBe('ages 5–9')
    expect(ageBandText({ min_age: 12 })).toBe('ages 12+')
    expect(ageBandText({ max_age: 11 }, { capital: true })).toBe('Up to age 11')
    expect(ageBandText({})).toBe('')
  })
})

describe('ClassSummaryLine', () => {
  it('renders each segment on its own so one can be found', () => {
    render(<ClassSummaryLine cls={{ min_age: 5, max_age: 9, is_full: true }} meetings="Tue 9am–10am" price="$50" />)
    expect(screen.getByText('Tue 9am–10am')).toBeInTheDocument()
    expect(screen.getByText('$50')).toBeInTheDocument()
    expect(screen.getByText('ages 5–9')).toBeInTheDocument()
    expect(screen.getByText('Full — waitlist')).toBeInTheDocument()
  })
  it('can hide the seat segment for an unlimited class', () => {
    const { container } = render(<ClassSummaryLine cls={{ spots_left: null }} hideOpen />)
    expect(container.textContent).toBe('')
  })
})
