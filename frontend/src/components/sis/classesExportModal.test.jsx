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

import ClassesExportModal, { LIST_COLUMNS, buildListRows, buildGridRows } from './ClassesExportModal'

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

// The old fixed export — the default column set must match it exactly.
const LEGACY_HEADER = 'Class name,Teacher,Days,Time,Ages,Description,Supply fee,Tuition,Classroom,Enrolled,Capacity,Waitlist'

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
  it('default export matches the old fixed CSV exactly', () => {
    render(<ClassesExportModal classes={CLASSES} orgName="iCreate Co" onClose={vi.fn()} />)
    openAndExport()
    const lines = downloaded.replace('﻿', '').split('\n')
    expect(lines[0]).toBe(LEGACY_HEADER)
    expect(lines[1]).toBe('Pottery,Jane Doe,Tue,9:30am-10:25am,8-12,Clay,$15,$120.00,Art Studio,2,10,3')
    expect(lines[2]).toBe('Guitar Jam,Jay,Tue Thu,9:30am-10:25am,10+,,,,Music Studio,0,,0')
    expect(filenames).toEqual(['icreate-co-classes.csv'])
  })

  it('unchecking a column drops it; extra columns can be added', () => {
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Description'))
    fireEvent.click(screen.getByLabelText('Registration'))
    openAndExport()
    const header = downloaded.replace('﻿', '').split('\n')[0]
    expect(header).not.toContain('Description')
    expect(header).toContain('Registration')
    expect(downloaded).not.toContain('Clay')
    expect(downloaded).toContain('Pottery,Jane Doe')   // column order is stable
    expect(downloaded.split('\n')[1]).toMatch(/Closed$/)  // Pottery is closed
    expect(downloaded.split('\n')[3]).toMatch(/Archived$/) // archived says so
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
    expect(downloaded.replace('﻿', '').split('\n')[0]).toBe(LEGACY_HEADER)
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
    const lines = downloaded.replace('﻿', '').split('\n')
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
    const lines = downloaded.replace('﻿', '').split('\n')
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
    expect(screen.getByText('Exporting 2 of 3 classes')).toBeInTheDocument()
    openAndExport()
    const lines = downloaded.replace('﻿', '').split('\n')
    expect(lines).toHaveLength(3) // header + 2 classes (Pottery, Old Thing)
    expect(downloaded).toContain('Pottery')
    expect(downloaded).not.toContain('Guitar Jam')
  })

  it('filters export by selected day', () => {
    render(<ClassesExportModal classes={CLASSES} orgName="Org" onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Filter by day'), { target: { value: '4' } }) // Thursday
    expect(screen.getByText('Exporting 1 of 3 classes')).toBeInTheDocument()
    openAndExport()
    const lines = downloaded.replace('﻿', '').split('\n')
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
