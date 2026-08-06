/**
 * One class editor, used by the row editor and the modal.
 *
 * iCreate, 2026-08-06: "I don't like the format of the expanded inline
 * editor... maybe remove the need for the full editor?"
 *
 * There were two field grids differing by exactly two fields (the image and the
 * materials allowance) and by which bugs each had — which is how an assistant
 * teacher could be set in one and silently dropped on save. These tests hold the
 * consolidation: one grid, everything in it, and a payload builder that can't
 * quietly omit a field.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import ClassFieldsEditor from './ClassFieldsEditor'
import { toDraft, draftToPayload } from './classFields'

const CLASS = {
  id: 'c1', name: 'Pottery', description: 'Clay', capacity: 10, price_cents: 12000,
  supply_fee: 15, supply_budget_per_student: 40, min_age: 8, max_age: 12,
  location: 'Room 3', primary_instructor_id: 's1', assistant_instructor_ids: ['s2'],
  show_assistants: true, requires_full_day: false, image_url: null,
  meetings: [{ day_of_week: 2, start_time: '14:00', end_time: '15:00' }],
}
const STAFF = [{ id: 's1', name: 'Jane Doe' }, { id: 's2', name: 'Sam Lee' }]

const setup = (over = {}) => {
  const onChange = vi.fn()
  render(<ClassFieldsEditor draft={toDraft(CLASS)} onChange={onChange} staff={STAFF} {...over} />)
  return onChange
}

describe('the class field grid', () => {
  it('groups the fields instead of running them together', () => {
    setup()
    expect(screen.getByText('Basics')).toBeInTheDocument()
    expect(screen.getByText('Schedule')).toBeInTheDocument()
    expect(screen.getByText('Enrollment & money')).toBeInTheDocument()
  })

  it('carries the two fields that used to need the full editor', () => {
    setup({ onImageChange: vi.fn() })
    expect(screen.getByLabelText('Class image')).toBeInTheDocument()
    expect(screen.getByLabelText('Materials allowance per student')).toHaveValue(40)
  })

  it('leaves the image out when the host cannot upload one', () => {
    setup()
    expect(screen.queryByLabelText('Class image')).not.toBeInTheDocument()
  })

  it('does not put registration among the fields', () => {
    // It saves immediately while everything else is a draft, so it belongs
    // beside the class, not in the grid.
    setup()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('reports edits as patches', () => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText('Class name'), { target: { value: 'Pottery II' } })
    expect(onChange).toHaveBeenCalledWith({ name: 'Pottery II' })
  })

  it('keeps the description with the name it describes', () => {
    setup()
    expect(screen.getByLabelText('Class description')).toHaveValue('Clay')
  })
})

describe('the draft round trip', () => {
  it('reads every editable attribute off a class', () => {
    const d = toDraft(CLASS)
    expect(d).toMatchObject({
      name: 'Pottery', capacity: '10', tuition: '120', supply_fee: '15',
      supply_budget_per_student: '40', min_age: '8', max_age: '12',
      location: 'Room 3', assistant_instructor_ids: ['s2'], days_of_week: [2],
      start_time: '14:00', duration_minutes: '60',
    })
  })

  it('writes every one of them back', () => {
    // The bug this module exists to stop: a payload builder listing fields by
    // hand and quietly missing some, so what you set came back empty.
    const payload = draftToPayload(toDraft(CLASS))
    expect(payload).toMatchObject({
      name: 'Pottery', capacity: 10, price_cents: 12000, supply_fee: 15,
      supply_budget_per_student: 40, min_age: 8, max_age: 12,
      assistant_instructor_ids: ['s2'], show_assistants: true,
      days_of_week: [2], start_time: '14:00', duration_minutes: 60,
    })
  })

  it('sends a blank materials allowance as null, not zero', () => {
    // '' means "use the school default", and 0 would mean "no allowance".
    const payload = draftToPayload({ ...toDraft(CLASS), supply_budget_per_student: '' })
    expect(payload.supply_budget_per_student).toBeNull()
  })

  it('survives a class with nothing set on it', () => {
    expect(() => draftToPayload(toDraft({}))).not.toThrow()
  })
})

/**
 * Density. iCreate, 2026-08-06: "the registration toggle doesn't need its own
 * full row. class image leaves lots of blank space on the right. the times are
 * too big. generally lots of inefficient use of space."
 */
describe('the grid earns its space', () => {
  const shape = (container) => [...container.querySelectorAll('section')].map((b) => {
    const fields = b.querySelectorAll(':scope > div.grid > div')
    const cols = [...fields].reduce((sum, f) => {
      const m = f.className.match(/md:col-span-(\d)/) || f.className.match(/col-span-(\d)/)
      return sum + Number(m?.[1] || 1)
    }, 0)
    return { title: b.querySelector('h4').textContent, rows: Math.ceil(cols / 4) }
  })

  it('fits every field into five rows of four', () => {
    const { container } = render(
      <ClassFieldsEditor draft={toDraft(CLASS)} onChange={() => {}} staff={STAFF}
        onImageChange={() => {}} timeBlocks={[]} />,
    )
    expect(shape(container)).toEqual([
      { title: 'Basics', rows: 2 },
      { title: 'Schedule', rows: 1 },
      { title: 'Enrollment & money', rows: 2 },
    ])
  })

  it('puts the registration switch on the heading line, not a row of its own', () => {
    const { container } = render(
      <ClassFieldsEditor draft={toDraft(CLASS)} onChange={() => {}} staff={STAFF}
        headerAside={<button type="button" role="switch" aria-checked aria-label="Toggle registration" />} />,
    )
    const basics = container.querySelector('section')
    // Inside the heading row, above the grid.
    expect(basics.querySelector('div').querySelector('[role="switch"]')).toBeTruthy()
    expect(basics.querySelector('div.grid [role="switch"]')).toBeNull()
  })

  it('shows am/pm on the time pickers', () => {
    // fmt12 drops the meridiem — right on a block pill, but it turned a 2pm
    // start and a 3pm end into "2" and "3" in these dropdowns.
    render(
      <ClassFieldsEditor draft={toDraft(CLASS)} onChange={() => {}} staff={STAFF}
        timeBlocks={[{ start: '14:00', end: '15:00' }]} />,
    )
    expect(screen.getByRole('option', { name: '2pm' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '3pm' })).toBeInTheDocument()
  })
})
