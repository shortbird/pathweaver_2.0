/**
 * Compose's picker (iCreate, 2026-09-23, bf8b754d / 8ee000b6): staff, families
 * and students in one list, narrowed by role, class and age, and a class split
 * into its teacher, aides, students and families.
 *
 * What these pin: filters show people and never pick them; age narrows
 * students by their own age and families by their children's; a class shows
 * its own staff, students and the families of those students; and the send
 * carries the channels the office chose.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../pages/sis/useSisOrg', () => ({ withOrg: (url) => url }))

import ComposeMessageModal, { filterPeople, classPartIds, senderFor } from './ComposeMessageModal'

const TAM = { id: 'tam', name: 'Tam Teacher', kinds: ['staff', 'family'], staff_kinds: ['teacher'], role_labels: ['Teacher'], child_ids: ['ada'], children: ['Ada'] }
const AL = { id: 'al', name: 'Al Aide', kinds: ['staff'], staff_kinds: ['teacher'], role_labels: ['Teacher'] }
const KATE = { id: 'kate', name: 'Kate Office', kinds: ['staff'], staff_kinds: ['office'], role_labels: ['Admin'] }
const MUM = { id: 'mum', name: 'Mia Lark', kinds: ['family'], staff_kinds: [], child_ids: ['ada', 'ben'], children: ['Ada', 'Ben'] }
const ADA = { id: 'ada', name: 'Ada Lark', kinds: ['student'], staff_kinds: [], age: 7, class_ids: ['art'] }
const BEN = { id: 'ben', name: 'Ben Lark', kinds: ['student'], staff_kinds: [], age: 12, class_ids: [] }
const CY = { id: 'cy', name: 'Cy Moss', kinds: ['student'], staff_kinds: [], age: null, class_ids: [] }
const PEOPLE = [TAM, AL, KATE, MUM, ADA, BEN, CY]
const ART = { id: 'art', name: 'Art', teacher_ids: ['tam'], aide_ids: ['al'], student_ids: ['ada'] }

const ids = (list) => list.map((p) => p.id)

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('senderFor', () => {
  const counts = (staff, family = 0, student = 0) => ({ staff, family, student })
  it('matches message_compose_service: families and students hear from the school', () => {
    expect(senderFor({ asSchool: false, group: false, counts: counts(1, 1) })).toBe('school')
    expect(senderFor({ asSchool: false, group: false, counts: counts(0, 0, 1) })).toBe('school')
  })
  it('staff written to separately hear from you, whichever tab', () => {
    expect(senderFor({ asSchool: true, group: false, counts: counts(2) })).toBe('you')
    expect(senderFor({ asSchool: false, group: false, counts: counts(2) })).toBe('you')
  })
  it('a staff group from the school tab is the school\'s; a teacher is always themselves', () => {
    expect(senderFor({ asSchool: true, group: true, counts: counts(3) })).toBe('school')
    expect(senderFor({ asSchool: false, group: true, counts: counts(3) })).toBe('you')
    expect(senderFor({ asSchool: true, asTeacher: true, group: false, counts: counts(1, 1) })).toBe('you')
  })
})

describe('filterPeople', () => {
  it('shows everybody with no filter', () => {
    expect(ids(filterPeople(PEOPLE, [ART]))).toEqual(ids(PEOPLE))
  })

  it('combines roles: parents and office', () => {
    expect(ids(filterPeople(PEOPLE, [ART], { roles: new Set(['family', 'office']) })))
      .toEqual(['tam', 'kate', 'mum'])
  })

  it('narrows students by age and families by their children, and drops staff', () => {
    const shown = ids(filterPeople(PEOPLE, [ART], { ageMin: '10', ageMax: '' }))
    expect(shown).toEqual(['mum', 'ben'])
  })

  it('leaves out a student with no birth date when ages are asked for', () => {
    expect(ids(filterPeople(PEOPLE, [ART], { ageMax: '99' }))).not.toContain('cy')
  })

  it('shows a class: its staff, its students and the families of those students', () => {
    expect(ids(filterPeople(PEOPLE, [ART], { classId: 'art' }))).toEqual(['tam', 'al', 'mum', 'ada'])
  })

  it('splits a class into its four picks', () => {
    expect(classPartIds(ART, PEOPLE)).toEqual({
      teachers: ['tam'], aides: ['al'], students: ['ada'], families: ['tam', 'mum'],
    })
  })
})

describe('ComposeMessageModal', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.get.mockResolvedValue({ data: { people: PEOPLE, classes: [ART], presets: [], without_birthdate: 1 } })
    api.post.mockResolvedValue({ data: { mode: 'separate', sent: 2, skipped: [], emailed: 0 } })
  })

  it('adds a class aide and its families in two clicks, and sends with the chosen channels', async () => {
    const onSent = vi.fn()
    render(<ComposeMessageModal isOpen onClose={vi.fn()} onSent={onSent} asSchool />)
    await screen.findByLabelText('Select Mia Lark')
    // The class filter is a SearchSelect: type and pick.
    fireEvent.focus(screen.getByPlaceholderText('Every class'))
    fireEvent.change(screen.getByPlaceholderText('Every class'), { target: { value: 'Art' } })
    fireEvent.mouseDown(await screen.findByText('Art', { selector: 'button, button *' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Aide: Al Aide/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Families/ }))
    expect(screen.getByText(/1 staff member, 2 parents/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/Push notification/))
    fireEvent.click(screen.getByLabelText(/^Email/))
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Clay day Friday' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/messaging/send')
    expect(body.recipient_ids.sort()).toEqual(['al', 'mum', 'tam'])
    expect(body).toMatchObject({ mode: 'separate', push: false, email: true, as_school: true,
      body: 'Clay day Friday' })
    expect(onSent).toHaveBeenCalled()
  })

  // iCreate, 2026-09-25: "just to Molly", composed on the School tab, went
  // out as the school. Who it comes from is said before it is sent.
  it('says a note to a colleague comes from you, even from the school tab', async () => {
    render(<ComposeMessageModal isOpen onClose={vi.fn()} asSchool orgName="iCreate" />)
    fireEvent.click(await screen.findByLabelText('Select Kate Office'))
    expect(screen.getByText('From:').parentElement).toHaveTextContent('From: You')
    fireEvent.click(screen.getByLabelText('Select Mia Lark'))
    expect(screen.getByText('From:').parentElement).toHaveTextContent('From: iCreate')
  })

  it('keeps a pick when the filter moves on', async () => {
    render(<ComposeMessageModal isOpen onClose={vi.fn()} />)
    fireEvent.click(await screen.findByLabelText('Select Kate Office'))
    fireEvent.click(screen.getByRole('button', { name: 'Students' }))
    expect(screen.queryByLabelText('Select Kate Office')).toBeNull()
    const also = screen.getByText('Also picked:').parentElement
    expect(within(also).getByText('Kate Office')).toBeInTheDocument()
  })

  it('offers one group thread only for two or more, and warns that families see each other', async () => {
    render(<ComposeMessageModal isOpen onClose={vi.fn()} />)
    fireEvent.click(await screen.findByLabelText('Select Mia Lark'))
    expect(screen.queryByLabelText(/One group thread/)).toBeNull()
    fireEvent.click(screen.getByLabelText('Select Kate Office'))
    fireEvent.click(screen.getByLabelText(/One group thread/))
    expect(screen.getByText(/Families in it see each other/)).toBeInTheDocument()
  })
})
