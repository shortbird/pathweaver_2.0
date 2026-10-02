import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * Classes › Export CSV — pick columns, or export schedule grids.
 *
 * iCreate, 2026-08-12: "I love that I can export an CSV, but I would love it
 * more if I could select what I want that spreadsheet to look like! (Or have
 * views in these formats!)" — attaching a sheet of hand-built tabs: a master
 * class list plus grids by teacher and by room, three lines per time slot
 * (class / ages / room-or-teacher).
 */

import ClassesExportModal, { LIST_COLUMNS, buildListRows, buildGridRows, buildHoursRows } from './ClassesExportModal'

const CLASSES = [
  { id: 'c1', name: 'Pottery', description: 'Clay', enrolled_count: 2, capacity: 10,
    supply_fee: 15, price_cents: 12000, min_age: 8, max_age: 12, registration_status: 'closed',
    waitlist_count: 3, location: 'Art Studio', primary_instructor: { name: 'Jane Doe' },
    meetings: [{ day_of_week: 2, start_time: '09:30:00', end_time: '10:25:00' }] },
  { id: 'c2', name: 'Guitar Jam', min_age: 10, location: 'Music Studio',
    registration_status: 'open', primary_instructor: { name: 'Jay' },
    meetings: [
      { day_of_week: 2, start_time: '09:30:00', end_time: '10:25:00' },
      { day_of_week: 4, start_time: '13:00:00', end_time: '14:00:00' },
    ] },
  // Archived: stays in the list export, but a schedule grid is what's running.
  { id: 'c3', name: 'Old Thing', status: 'archived', location: 'Art Studio',
    primary_instructor: { name: 'Jane Doe' },
    meetings: [{ day_of_week: 2, start_time: '09:30:00', end_time: '10:25:00' }] },
]

// The old fixed export, plus the two columns ticket 2704bbd4 (Molly) put on by
// default on 2026-10-02: who assists, and whether the class is paid.
const LEGACY_HEADER = 'Class name,Teacher,Days,Time,Ages,Description,Supply fee,Tuition,Classroom,Enrolled,Capacity,Waitlist,Assistants,Paid'

let downloaded = ''
let filenames = []
let originalCreate

// The real localStorage is unusable under this jsdom setup (see the "jsdom
// quirk" comments elsewhere) — swap in a working in-memory one so the
// remember-my-choices behavior is actually exercised.
const memoryStorage = () => {
  let store = {}
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
    clear: () => { store = {} },
  }
}

beforeEach(() => {
  downloaded = ''
  filenames = []
  vi.stubGlobal('localStorage', memoryStorage())
  originalCreate = URL.createObjectURL
  // jsdom has no Blob.text() in the click path — read the CSV out of the Blob.
  URL.createObjectURL = vi.fn((blob) => { downloaded = blob._text || ''; return 'blob:mock' })
  URL.revokeObjectURL = vi.fn()
  const OriginalBlob = global.Blob
  global.Blob = class extends OriginalBlob {
    constructor(parts, opts) { super(parts, opts); this._text = (parts || []).join('') }
  }
  const origCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag, ...rest) => {
    const el = origCreateElement(tag, ...rest)
    if (tag === 'a') {
      const click = el.click.bind(el)
      el.click = () => { filenames.push(el.download); click() }
    }
    return el
  })
})

afterEach(() => {
  URL.createObjectURL = originalCreate
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const openAndExport = () => fireEvent.click(screen.getByRole('button', { name: 'Export' }))

describe('ClassesExportModal — class list', () => {
  it('default export is the old fixed CSV plus Assistants and Paid', () => {
    render(<ClassesExportModal classes={CLASSES} orgName="iCreate Co" onClose={vi.fn()} />)
    openAndExport()
    // CRLF since M17: every SIS export is written by utils/csv.js, the way
    // the People and roster exports always were (RFC 4180, and Excel's own).
    const lines = downloaded.replace('﻿', '').split(/\r?\n/)
    expect(lines[0]).toBe(LEGACY_HEADER)
    expect(lines[1]).toBe('Pottery,Jane Doe,Tue,9:30am-10:25am,8-12,Clay,$15,$120.00,Art Studio,2,10,3,,Yes')
    expect(lines[2]).toBe('Guitar Jam,Jay,Tue Thu,9:30am-10:25am,10+,,,,Music Studio,0,,0,,Yes')
    expect(filenames).toEqual(['icreate-co-classes.csv'])
  })

  it('unchecking a column drops it; extra columns can be added', () => {
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Description'))
    fireEvent.click(screen.getByLabelText('Registration'))
    // Archived rows are excluded by default now; this test is about what the
    // Registration column SAYS for one, so put it back.
    fireEvent.click(screen.getByLabelText('Exclude archived classes'))
    openAndExport()
    const header = downloaded.replace('﻿', '').split(/\r?\n/)[0]
    expect(header).not.toContain('Description')
    expect(header).toContain('Registration')
    expect(downloaded).not.toContain('Clay')
    expect(downloaded).toContain('Pottery,Jane Doe')   // column order is stable
    // Registration is no longer the last column (Assistants and Paid follow it
    // since 2026-10-02), so match the cell, not the end of the line.
    expect(downloaded.split(/\r?\n/)[1]).toMatch(/,Closed,/)  // Pottery is closed
    expect(downloaded.split(/\r?\n/)[3]).toMatch(/,Archived,/) // archived says so
  })

  it('remembers the chosen columns for the next export', () => {
    const { unmount } = render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Description'))
    unmount()
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    expect(screen.getByLabelText('Description')).not.toBeChecked()
    fireEvent.click(screen.getByText('Reset to default'))
    expect(screen.getByLabelText('Description')).toBeChecked()
    openAndExport()
    expect(downloaded.replace('﻿', '').split(/\r?\n/)[0]).toBe(LEGACY_HEADER)
  })

  it('cannot export a list with zero columns', () => {
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    LIST_COLUMNS.forEach((c) => {
      const box = screen.getByLabelText(c.label)
      if (box.checked) fireEvent.click(box)
    })
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })
})

describe('ClassesExportModal — schedule grids', () => {
  it('exports a grid with one column per teacher, three rows per time slot', () => {
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/Schedule grid by teacher/))
    openAndExport()
    const lines = downloaded.replace('﻿', '').split(/\r?\n/)
    expect(lines[0]).toBe(',Jane Doe,Jay')
    expect(lines[1]).toBe('TUESDAY,,')
    expect(lines[2]).toBe('9:30am - Class,Pottery,Guitar Jam')
    expect(lines[3]).toBe('9:30am - Ages,8-12,10+')
    expect(lines[4]).toBe('9:30am - Room,Art Studio,Music Studio')
    expect(lines[5]).toBe('THURSDAY,,')
    expect(lines[6]).toBe('1:00pm - Class,,Guitar Jam')
    expect(downloaded).not.toContain('Old Thing') // archived classes are not on the schedule
    expect(filenames).toEqual(['org-schedule-by-teacher.csv'])
  })

  it('exports a grid with one column per room, teacher on the third row', () => {
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/Schedule grid by room/))
    openAndExport()
    const lines = downloaded.replace('﻿', '').split(/\r?\n/)
    expect(lines[0]).toBe(',Art Studio,Music Studio')
    expect(lines[2]).toBe('9:30am - Class,Pottery,Guitar Jam')
    expect(lines[4]).toBe('9:30am - Teacher,Jane Doe,Jay')
    expect(filenames).toEqual(['org-schedule-by-room.csv'])
  })

  it('remembers the grid format choice', () => {
    const { unmount } = render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/Schedule grid by room/))
    unmount()
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    expect(screen.getByLabelText(/Schedule grid by room/)).toBeChecked()
  })
})

describe('ClassesExportModal — filtering', () => {
  it('displays hints for columns like start time, time, and registration', () => {
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    expect(screen.getByText('Full time range (e.g. 9:00am–10:00am)')).toBeInTheDocument()
    expect(screen.getByText('Start time only (e.g. 9:00am)')).toBeInTheDocument()
    expect(screen.getByText('Status: Open, Closed, or Archived')).toBeInTheDocument()
  })

  it('filters export by selected teacher', () => {
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Filter by teacher'), { target: { value: 'Jane Doe' } })
    // Jane teaches Pottery and the archived Old Thing; archived is excluded.
    expect(screen.getByText('Exporting 1 of 3 classes')).toBeInTheDocument()
    openAndExport()
    const lines = downloaded.replace('﻿', '').split(/\r?\n/)
    expect(lines).toHaveLength(2) // header + Pottery
    expect(downloaded).toContain('Pottery')
    expect(downloaded).not.toContain('Guitar Jam')
  })

  /**
   * iCreate, 2026-08-18: 'I need to be able to select "Exclude Archived
   * classes" (if it's including those in the CSV)'. It was — the schedule
   * grids dropped archived rows, the class list did not, and the modal is
   * handed whatever the page is showing.
   */
  it('excludes archived classes by default, and says how many it dropped', () => {
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    expect(screen.getByLabelText('Exclude archived classes')).toBeChecked()
    expect(screen.getByText('1 archived class in view')).toBeInTheDocument()
    expect(screen.getByText('Exporting 2 of 3 classes')).toBeInTheDocument()
    openAndExport()
    expect(downloaded).not.toContain('Old Thing')
    expect(downloaded).toContain('Pottery')
  })

  it('unticking it puts the archived classes back', () => {
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Exclude archived classes'))
    openAndExport()
    expect(downloaded).toContain('Old Thing')
  })

  it('remembers the choice, and an older saved pref still gets the new default', () => {
    // A browser that used the modal before this checkbox existed holds a prefs
    // object with no excludeArchived key; it must not read as "include them".
    localStorage.setItem('sis_classes_export', JSON.stringify({ format: 'list' }))
    const { unmount } = render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    expect(screen.getByLabelText('Exclude archived classes')).toBeChecked()
    fireEvent.click(screen.getByLabelText('Exclude archived classes'))
    unmount()
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    expect(screen.getByLabelText('Exclude archived classes')).not.toBeChecked()
  })

  it('filters export by selected day', () => {
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Filter by day'), { target: { value: '4' } }) // Thursday
    expect(screen.getByText('Exporting 1 of 3 classes')).toBeInTheDocument()
    openAndExport()
    const lines = downloaded.replace('﻿', '').split(/\r?\n/)
    expect(lines).toHaveLength(2) // header + 1 class (Guitar Jam)
    expect(downloaded).toContain('Guitar Jam')
    expect(downloaded).not.toContain('Pottery')
  })
})

describe('grid builder edge cases', () => {
  it('groups unassigned classes under No teacher / No room columns', () => {
    const orphan = [{ id: 'x', name: 'Open Play', meetings: [{ day_of_week: 1, start_time: '10:00:00', end_time: '11:00:00' }] }]
    expect(buildGridRows(orphan, 'teacher')[0]).toEqual(['', 'No teacher'])
    expect(buildGridRows(orphan, 'room')[0]).toEqual(['', 'No room'])
    expect(buildGridRows(orphan, 'teacher')[1]).toEqual(['MONDAY', ''])
  })

  it('joins two same-slot classes for the same teacher in one cell', () => {
    const double = [
      { id: 'a', name: 'A', primary_instructor: { name: 'Jo' },
        meetings: [{ day_of_week: 1, start_time: '10:00:00' }] },
      { id: 'b', name: 'B', primary_instructor: { name: 'Jo' },
        meetings: [{ day_of_week: 1, start_time: '10:00:00' }] },
    ]
    const rows = buildGridRows(double, 'teacher')
    expect(rows[2]).toEqual(['10:00am - Class', 'A; B'])
  })

  it('a class with no meetings appears in the list but not in grids', () => {
    const cls = [{ id: 'y', name: 'Sometime Club', meetings: [] }]
    expect(buildListRows(cls, ['name'])[1]).toEqual(['Sometime Club'])
    expect(buildGridRows(cls, 'teacher')).toEqual([['']])
  })
})

/**
 * Ticket 2704bbd4 (iCreate, Molly, /classes): "On export csv, I need to know
 * who is assisting in the class too, so that I can know who to pay. ... I also
 * added some classes just so the teachers could have a roster, and I need to
 * exclude them from being paid. Or I need to be able to download all the hours
 * that teachers taught in the week!"
 */
describe('2704bbd4 — assistants, roster-only classes, weekly teaching hours', () => {
  const STAFF = [
    { id: 'a', name: 'Art', status: 'active', primary_instructor: { id: 'u1', name: 'Jane Doe' },
      assistant_instructors: [{ id: 'u2', name: 'Bob Aide' }, { id: 'u3', name: 'Cy Help' }],
      meetings: [
        { day_of_week: 1, start_time: '09:00:00', end_time: '10:30:00' },
        { day_of_week: 3, start_time: '09:00:00', end_time: '10:30:00' },
        // A one-off dated meeting is not part of the week.
        { day_of_week: null, specific_date: '2026-10-10', start_time: '09:00:00', end_time: '12:00:00' },
      ] },
    // No assistants at all.
    { id: 'b', name: 'Band', primary_instructor: { id: 'u2', name: 'Bob Aide' },
      meetings: [{ day_of_week: 2, start_time: '13:00:00', end_time: '13:45:00' }] },
    // Roster only: the teachers are not paid for it.
    { id: 'r', name: 'Roster Room', exclude_from_pay: true, primary_instructor: { id: 'u1', name: 'Jane Doe' },
      assistant_instructors: [{ id: 'u4', name: 'Dee Never' }],
      meetings: [{ day_of_week: 1, start_time: '12:00:00', end_time: '15:00:00' }] },
    { id: 'z', name: 'Gone', status: 'archived', primary_instructor: { id: 'u1', name: 'Jane Doe' },
      meetings: [{ day_of_week: 4, start_time: '12:00:00', end_time: '15:00:00' }] },
  ]

  it('the Assistants column lists them, and is blank for a class with none', () => {
    const rows = buildListRows(STAFF, ['name', 'assistants'])
    expect(rows[0]).toEqual(['Class name', 'Assistants'])
    expect(rows[1]).toEqual(['Art', 'Bob Aide; Cy Help'])
    expect(rows[2]).toEqual(['Band', ''])
  })

  it('the Paid column says No only for a roster-only class', () => {
    const rows = buildListRows(STAFF, ['name', 'paid'])
    expect(rows.slice(1, 4)).toEqual([['Art', 'Yes'], ['Band', 'Yes'], ['Roster Room', 'No']])
  })

  it('both new columns are on by default (Tanner, 2026-10-02)', () => {
    // Was "off by default" when first built; Molly exports this list to work
    // out pay, so she should not have to find and tick them.
    expect(LIST_COLUMNS.find((c) => c.id === 'assistants').on).toBe(true)
    expect(LIST_COLUMNS.find((c) => c.id === 'paid').on).toBe(true)
  })

  it('a pref saved before these columns existed gets them switched on once', () => {
    localStorage.setItem('sis_classes_export', JSON.stringify({ format: 'list', cols: ['name', 'teacher'] }))
    const { unmount } = render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    expect(screen.getByLabelText('Assistants')).toBeChecked()
    expect(screen.getByLabelText('Paid')).toBeChecked()
    expect(screen.getByLabelText('Description')).not.toBeChecked() // their own choice stands
    // Turning one off afterwards sticks: it is not switched back on.
    fireEvent.click(screen.getByLabelText('Paid'))
    unmount()
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    expect(screen.getByLabelText('Paid')).not.toBeChecked()
    expect(screen.getByLabelText('Assistants')).toBeChecked()
  })

  it('the teacher grid puts a class in each assistant column, marked assisting', () => {
    const rows = buildGridRows([STAFF[0]], 'teacher')
    expect(rows[0]).toEqual(['', 'Bob Aide', 'Cy Help', 'Jane Doe'])
    expect(rows[2]).toEqual(['9:00am - Class', 'Art (assisting)', 'Art (assisting)', 'Art'])
  })

  it('the room grid names the assistants beside the teacher', () => {
    const rows = buildGridRows([STAFF[0], STAFF[1]], 'room')
    const teacherRows = rows.filter((r) => r[0].endsWith('- Teacher'))
    expect(teacherRows[0]).toEqual(['9:00am - Teacher', 'Jane Doe (assistants: Bob Aide; Cy Help)'])
    expect(teacherRows.some((r) => r[1] === 'Bob Aide')).toBe(true) // Band has no assistants
  })

  it('weekly hours: one row per staff member, assistants counted, roster-only and archived skipped', () => {
    expect(buildHoursRows(STAFF)).toEqual([
      ['Staff member', 'Hours per week', 'Classes taught', 'Classes assisting'],
      // Art 3 hr (2 x 1.5) as assistant + Band 0.75 hr as lead.
      ['Bob Aide', '3.75', 'Band', 'Art'],
      ['Cy Help', '3', '', 'Art'],
      // Roster Room (3 hr) and the archived Gone (3 hr) do not count.
      ['Jane Doe', '3', 'Art', ''],
    ])
  })

  it('weekly hours respect the day and teacher filters', () => {
    expect(buildHoursRows(STAFF, '2')).toEqual([
      ['Staff member', 'Hours per week', 'Classes taught', 'Classes assisting'],
      ['Bob Aide', '0.75', 'Band', ''],
    ])
    expect(buildHoursRows(STAFF, 'all', 'Cy Help').slice(1)).toEqual([['Cy Help', '3', '', 'Art']])
  })

  it('exports the weekly hours file from the modal', () => {
    render(<ClassesExportModal classes={STAFF} orgName="iCreate" onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/Weekly teaching hours/))
    openAndExport()
    const lines = downloaded.replace('\ufeff', '').split(/\r?\n/)
    expect(lines[0]).toBe('Staff member,Hours per week,Classes taught,Classes assisting')
    expect(lines[1]).toBe('Bob Aide,3.75,Band,Art')
    expect(downloaded).not.toContain('Dee Never')
    expect(downloaded).not.toContain('Roster Room')
    expect(filenames).toEqual(['icreate-weekly-teaching-hours.csv'])
  })
})
