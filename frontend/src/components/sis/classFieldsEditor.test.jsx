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
import { render, screen, fireEvent, within } from '@testing-library/react'

import ClassFieldsEditor from './ClassFieldsEditor'
import { toDraft, draftToPayload } from './classFields'

const CLASS = {
  id: 'c1', name: 'Pottery', description: 'Clay', capacity: 10, price_cents: 12000,
  supply_fee: 15, supply_budget_per_student: 40, min_age: 8, max_age: 12,
  location: 'Room 3', primary_instructor_id: 's1', assistant_instructor_ids: ['s2'],
  show_assistants: true, requires_full_day: false, image_url: null,
  internal_notes: 'Kiln needs 30 min warm-up',
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
    expect(screen.getByText('Internal notes')).toBeInTheDocument()
  })

  it('labels the internal notes as staff-only', () => {
    // The whole point of the field is that families never see it — the editor
    // must say so, or staff will treat it as one more public description box.
    setup()
    expect(screen.getByLabelText('Internal notes')).toHaveValue('Kiln needs 30 min warm-up')
    expect(screen.getByText(/staff only — families never see these/i)).toBeInTheDocument()
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

  /**
   * iCreate, 2026-08-11: "I want to NOT assign a teacher, but that's not an
   * option. We don't have any placeholders any more since I deleted them!"
   *
   * Nothing ever required a teacher — the column is nullable and no validation
   * checked it. What made it feel required was the picker: no visible "none"
   * choice, and the field vanishing entirely when the org had no staff left.
   */
  describe('a class can stand without a teacher', () => {
    it('offers an explicit way to choose nobody', () => {
      setup()
      fireEvent.focus(screen.getByPlaceholderText('Search staff…'))
      expect(screen.getByText('No teacher yet')).toBeInTheDocument()
    })

    it('clears the teacher when that choice is taken', () => {
      const onChange = setup()
      fireEvent.focus(screen.getByPlaceholderText('Search staff…'))
      fireEvent.mouseDown(screen.getByText('No teacher yet'))
      expect(onChange).toHaveBeenCalledWith({ primary_instructor_id: '' })
    })

    it('still shows the teacher field when the org has no staff at all', () => {
      // The reporter deleted their placeholder teachers; the field disappearing
      // is what made a teacher-less class look impossible rather than optional.
      setup({ staff: [] })
      expect(screen.getByText('Teacher (optional)')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('No staff to assign yet')).toBeInTheDocument()
    })

    it('sends an empty teacher to the API as null, not as an empty string', () => {
      expect(draftToPayload({ ...toDraft(CLASS), primary_instructor_id: '' })
        .primary_instructor_id).toBeNull()
    })
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
      internal_notes: 'Kiln needs 30 min warm-up',
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
      is_visible_to_parents: true,
      days_of_week: [2], start_time: '14:00', duration_minutes: 60,
      internal_notes: 'Kiln needs 30 min warm-up',
    })
  })

  it('allows toggling parent visibility on schedule', () => {
    const onChange = setup()
    const checkbox = screen.getByLabelText('Show class to parents')
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ is_visible_to_parents: false }))
  })

  it('sends a blank materials allowance as null, not zero', () => {
    // '' means "use the school default", and 0 would mean "no allowance".
    const payload = draftToPayload({ ...toDraft(CLASS), supply_budget_per_student: '' })
    expect(payload.supply_budget_per_student).toBeNull()
  })

  it('sends cleared internal notes as null so the save actually erases them', () => {
    const payload = draftToPayload({ ...toDraft(CLASS), internal_notes: '  ' })
    expect(payload.internal_notes).toBeNull()
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
  // Read the band's own column count and each field's span at the widest
  // breakpoint, so the assertion follows the layout instead of assuming it.
  const shape = (container) => [...container.querySelectorAll('section')].map((b) => {
    const grid = b.querySelector('div.grid')
    const cols = Number(grid.className.match(/lg:grid-cols-(\d)/)[1])
    const fields = grid.querySelectorAll(':scope > div')
    const used = [...fields].reduce((sum, f) => {
      const m = f.className.match(/lg:col-span-(\d)/) || f.className.match(/sm:col-span-(\d)/)
      return sum + Number(m?.[1] || 1)
    }, 0)
    return { title: b.querySelector('h4').textContent, cols, rows: Math.ceil(used / cols) }
  })

  const full = () => render(
    <ClassFieldsEditor draft={toDraft(CLASS)} onChange={() => {}} staff={STAFF}
      onImageChange={() => {}} timeBlocks={[]} />,
  )

  it('keeps every band tight — no half-empty rows', () => {
    expect(shape(full().container)).toEqual([
      { title: 'Basics', cols: 4, rows: 2 },
      { title: 'Schedule', cols: 5, rows: 1 },
      { title: 'Enrollment & money', cols: 5, rows: 1 },
      { title: 'Internal notes', cols: 4, rows: 1 },
    ])
  })

  it('puts the assistants beside the teacher, and the image beside the description', () => {
    const { container } = full()
    // Each field's OWN label — its first — not the checkbox and upload labels
    // nested inside some of them.
    const labels = [...container.querySelector('section').querySelectorAll(':scope div.grid > div')]
      .map((f) => f.querySelector('label').textContent)
    expect(labels).toEqual(['Name', 'Teacher (optional)', 'Assistant teacher(s)', 'Description', 'Class image'])
  })

  it('lets the image tile stretch to the description’s height', () => {
    const { container } = full()
    expect(container.querySelector('label[class*="min-h-"]')).toBeTruthy()
  })

  it('collapses to one column on a phone and two on a tablet', () => {
    const { container } = full()
    container.querySelectorAll('div.grid').forEach((g) => {
      expect(g.className).toContain('grid-cols-1')
      expect(g.className).toContain('sm:grid-cols-2')
    })
  })

  it('puts the registration switch on the heading line, not a row of its own', () => {
    const { container } = render(
      <ClassFieldsEditor draft={toDraft(CLASS)} onChange={() => {}} staff={STAFF}
        headerAside={<button type="button" role="switch" aria-checked aria-label="Toggle registration" />} />,
    )
    const basics = container.querySelector('section')
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

/**
 * iCreate, 2026-09-04 (f9d50612): "on the drop down menu for the rooms, maybe
 * it can show which ones are already occupied that hour."
 *
 * The office assigns rooms one class at a time and had no way to see, at the
 * moment of choosing, that the room was already spoken for — only afterwards,
 * on the day.
 */
describe('the room picker says what is already in each room', () => {
  const ROOMS = [{ name: 'Art Room' }, { name: 'Gym' }]
  // Pottery meets Tuesdays 2–3pm (from CLASS above). Choir is in the Gym at
  // that hour; Movement is in the Art Room, but on Mondays.
  const OCCUPANCY = {
    Gym: [{ class_id: 'other', class_name: 'Choir', day_of_week: 2, start_time: '14:00', end_time: '15:00' }],
    'Art Room': [{ class_id: 'other2', class_name: 'Movement', day_of_week: 1, start_time: '09:00', end_time: '10:00' }],
  }

  const withRooms = (over = {}) => setup({ rooms: ROOMS, roomOccupancy: OCCUPANCY, ...over })

  // The primary room select. A second one ("also uses") offers the same rooms,
  // so every option assertion says which picker it means.
  const classroom = () => within(screen.getByLabelText('Classroom'))

  it('marks a room busy at the hour this class meets', () => {
    withRooms()
    expect(classroom().getByRole('option', { name: /Gym — in use \(Choir\)/ })).toBeInTheDocument()
  })

  it('leaves a room alone when its booking is on another day', () => {
    withRooms()
    expect(classroom().getByRole('option', { name: 'Art Room' })).toBeInTheDocument()
  })

  it('warns under the select once a busy room is the chosen one', () => {
    render(
      <ClassFieldsEditor
        draft={{ ...toDraft(CLASS), location: 'Gym' }}
        onChange={vi.fn()} staff={STAFF} rooms={ROOMS} roomOccupancy={OCCUPANCY} />)
    expect(screen.getByText(/Gym is already booked at this time by Choir\./)).toBeInTheDocument()
  })

  it('does not count a class against its own room', () => {
    // Editing Pottery must not report Pottery as the thing in Pottery's way.
    render(
      <ClassFieldsEditor
        draft={{ ...toDraft(CLASS), location: 'Gym' }}
        onChange={vi.fn()} staff={STAFF} rooms={ROOMS}
        roomOccupancy={{
          Gym: [{ class_id: 'c1', class_name: 'Pottery', day_of_week: 2, start_time: '14:00', end_time: '15:00' }],
        }} />)
    expect(screen.queryByText(/already booked at this time/)).not.toBeInTheDocument()
  })

  it('says nothing at all before the class has a time', () => {
    // With no day or start time there is no "that hour" to answer about, and a
    // room marked busy against nothing is noise.
    render(
      <ClassFieldsEditor
        draft={{ ...toDraft(CLASS), days_of_week: [], start_time: '' }}
        onChange={vi.fn()} staff={STAFF} rooms={ROOMS} roomOccupancy={OCCUPANCY} />)
    expect(within(screen.getByLabelText('Classroom')).getByRole('option', { name: 'Gym' }))
      .toBeInTheDocument()
  })

  it('offers the other rooms as extra space the class also uses', () => {
    // iCreate, 2026-09-04 (43625a45): "can we have a way to add more than one
    // room to a class?" The pottery class is in the art room AND the kiln shed.
    render(
      <ClassFieldsEditor
        draft={{ ...toDraft(CLASS), location: 'Art Room' }}
        onChange={vi.fn()} staff={STAFF} rooms={ROOMS} roomOccupancy={OCCUPANCY} />)
    const also = within(screen.getByLabelText('Also uses room'))
    expect(also.getByRole('option', { name: /Gym/ })).toBeInTheDocument()
    // Never the room it is already in — a class does not share with itself.
    expect(also.queryByRole('option', { name: /^Art Room/ })).not.toBeInTheDocument()
  })

  it('drops a room the class no longer uses', () => {
    const onChange = vi.fn()
    render(
      <ClassFieldsEditor
        draft={{ ...toDraft(CLASS), location: 'Art Room', additional_locations: ['Gym'] }}
        onChange={onChange} staff={STAFF} rooms={ROOMS} roomOccupancy={OCCUPANCY} />)
    fireEvent.click(screen.getByLabelText('Remove Gym'))
    expect(onChange).toHaveBeenCalledWith({ additional_locations: [] })
  })
})
