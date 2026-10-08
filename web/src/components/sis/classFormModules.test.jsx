/**
 * A block switches off its own fields: the class form (docs/MICROSCHOOL_FIRST_PLAN.md
 * part 2).
 *
 * Horizon, 2026-10-07: "the entire backend/admin view is feeling clunky". A
 * school that neither bills nor registers through Optio still saw tuition,
 * supply fee, materials allowance, teacher pay, ages, capacity and the
 * registration switch on every class. Billing now owns the money fields and
 * teacher pay; registration owns capacity, ages, full-day, the open/closed
 * switch and the waitlist.
 *
 * Hidden is not cleared: a class that already carries a price keeps it when
 * somebody edits its name at a school that has since turned billing off.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import ClassFieldsEditor from './ClassFieldsEditor'
import ClassForm from './ClassForm'
import ClassesTable from './ClassesTable'
import ClassDetailModal from '../../pages/sis/classesPage/ClassDetailModal'
import { toDraft } from './classFields'

const ALL_ON = { id: 'org-1', effective_modules: ['sis', 'classes', 'billing', 'registration', 'attendance'] }
const OFFICE_OFF = { id: 'org-1', effective_modules: ['sis', 'classes', 'attendance'] }

const PRICED = {
  id: 'c1', name: 'Pottery', registration_status: 'open',
  price_cents: 15000, supply_fee: 20, supply_budget_per_student: 40,
  capacity: 12, min_age: 8, max_age: 12, requires_full_day: true, exclude_from_pay: true,
  enrolled_count: 3, waitlist_count: 2, meetings: [],
}

const MONEY_LABELS = ['Tuition', 'Supply fee', 'Materials allowance per student', 'Roster only — not paid']
const REGISTRATION_LABELS = ['Capacity', 'Minimum age', 'Maximum age', 'Requires a full day of classes']

const editor = (org) => render(
  <ClassFieldsEditor draft={toDraft(PRICED)} onChange={() => {}} org={org} />,
)

describe('ClassFieldsEditor hides the fields of a module that is off', () => {
  it('shows the money and registration fields when both blocks are on', () => {
    editor(ALL_ON)
    for (const label of [...MONEY_LABELS, ...REGISTRATION_LABELS]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('Enrollment & money')).toBeInTheDocument()
  })

  it('drops tuition, supply fee, materials allowance and teacher pay without billing', () => {
    editor({ id: 'org-1', effective_modules: ['sis', 'classes', 'registration'] })
    for (const label of MONEY_LABELS) expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    for (const label of REGISTRATION_LABELS) expect(screen.getByLabelText(label)).toBeInTheDocument()
    expect(screen.getByText('Enrollment')).toBeInTheDocument()
  })

  it('drops capacity, ages and full-day without registration', () => {
    editor({ id: 'org-1', effective_modules: ['sis', 'classes', 'billing'] })
    for (const label of REGISTRATION_LABELS) expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    for (const label of MONEY_LABELS) expect(screen.getByLabelText(label)).toBeInTheDocument()
  })

  it('drops the whole band with both off, and keeps rooms and times', () => {
    editor(OFFICE_OFF)
    expect(screen.queryByText(/Enrollment|Money/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Classroom')).toBeInTheDocument()
    expect(screen.getByLabelText('Start time')).toBeInTheDocument()
  })

  it('shows everything when no org is in hand (as before)', () => {
    editor(null)
    for (const label of [...MONEY_LABELS, ...REGISTRATION_LABELS]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })
})

describe('ClassForm keeps a hidden field\'s saved value on save', () => {
  it('sends back the price, ages and capacity it never showed', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ClassForm initial={PRICED} onSubmit={onSubmit} org={OFFICE_OFF} />)
    expect(screen.queryByLabelText('Tuition')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Class name'), { target: { value: 'Pottery II' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: 'Pottery II',
      price_cents: 15000, supply_fee: 20, supply_budget_per_student: 40,
      capacity: 12, min_age: 8, max_age: 12,
      requires_full_day: true, exclude_from_pay: true,
    })
  })

  it('offers "Open for registration" on create only with registration on', () => {
    const { unmount } = render(<ClassForm onSubmit={vi.fn()} org={ALL_ON} />)
    expect(screen.getByText('Open for registration')).toBeInTheDocument()
    unmount()
    render(<ClassForm onSubmit={vi.fn()} org={OFFICE_OFF} />)
    expect(screen.queryByText('Open for registration')).not.toBeInTheDocument()
  })
})

const table = (org) => render(
  <MemoryRouter>
    <ClassesTable classes={[PRICED]} staff={[]} onSave={vi.fn()} onToggleRegistration={vi.fn()}
      onOpen={vi.fn()} onRoster={vi.fn()} onOfferSeat={vi.fn()} org={org} />
  </MemoryRouter>,
)

describe('ClassesTable follows the registration block', () => {
  it('shows Ages, the waitlist and the registration switch with registration on', () => {
    table(ALL_ON)
    expect(screen.getByRole('columnheader', { name: /Ages/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Waitlist/ })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Pottery'))
    expect(screen.getByRole('switch', { name: 'Toggle registration for Pottery' })).toBeInTheDocument()
  })

  it('drops them without registration, and keeps Roster', () => {
    table(OFFICE_OFF)
    expect(screen.queryByRole('columnheader', { name: /Ages/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /Waitlist/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Offer next seat' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Roster' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Pottery'))
    expect(screen.queryByRole('switch', { name: 'Toggle registration for Pottery' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Tuition')).not.toBeInTheDocument()
  })
})

const detail = (org) => render(
  <MemoryRouter>
    <ClassDetailModal cls={PRICED} staff={[]} orgId="org-1" onClose={vi.fn()} onSubmit={vi.fn()}
      onToggleRegistration={vi.fn()} onArchive={vi.fn()} onRestore={vi.fn()} org={org} />
  </MemoryRouter>,
)

describe('ClassDetailModal follows the registration block', () => {
  it('has the Waitlist tab and the switch with registration on', () => {
    detail(ALL_ON)
    expect(screen.getByRole('tab', { name: 'Waitlist' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Toggle registration' })).toBeInTheDocument()
  })

  it('has neither without registration', () => {
    detail(OFFICE_OFF)
    expect(screen.queryByRole('tab', { name: 'Waitlist' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Toggle registration' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Roster' })).toBeInTheDocument()
  })
})
