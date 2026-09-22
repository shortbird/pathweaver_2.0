/**
 * Who a board announcement is for, asked once.
 *
 * The composer that could send to families without the staff went with the
 * targeted send on 2026-09-10 ("One announcement composer, not three", which
 * named a narrowed audience among the four things it removed with no
 * replacement). The messaging composer offered in its place can only pick
 * staff, so the weekly newsletter notified every teacher in the school and the
 * form gave no way to say otherwise -- and no way to find out, either, which is
 * how the question arrived: "does the newsletter really go to the teachers?"
 *
 * So these assertions are about the answer being on the form: Families is an
 * audience, and ticking "Also notify people" states in words who that is. The
 * reach line is derived from the same table the option list is, because the
 * server derives the send from this one choice -- a label that disagrees with
 * it is a lie about what Post does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { announcements, saveAnnouncement } = vi.hoisted(() => ({
  announcements: { current: [] },
  saveAnnouncement: vi.fn(async () => ({ data: {} })),
}))

vi.mock('../../hooks/api/useSisCommunity', () => ({
  useCommunityAnnouncements: () => ({
    data: announcements.current, isPending: false, isError: false,
  }),
  sisCommunityApi: { saveAnnouncement, deleteAnnouncement: vi.fn() },
  invalidateCommunity: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../pages/sis/useSisOrg', () => ({
  useSisOrg: () => ({ activeOrg: { feature_flags: { sis_settings: {} } } }),
  withOrg: (url) => url,
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))
// The editor is tiptap; none of this is about the body.
vi.mock('../course/outline/RichTextEditor', () => ({
  default: ({ value, onChange }) => (
    <textarea aria-label="Message" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))

import BoardAnnouncementsTab from './BoardAnnouncementsTab'

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const openComposer = () => {
  render(<BoardAnnouncementsTab orgId="org-1" admin />)
  fireEvent.click(screen.getByRole('button', { name: 'Post announcement' }))
  return screen.getByLabelText(/Visible to/)
}

const optionsOf = (select) => [...select.querySelectorAll('option')].map((o) => o.textContent)

beforeEach(() => {
  announcements.current = []
  saveAnnouncement.mockClear()
})

describe('the audience a board post is written for', () => {
  it('offers Families', () => {
    expect(optionsOf(openComposer())).toEqual([
      'Everyone at the school', 'Families', 'Staff only',
    ])
  })

  it('no longer offers Admins only', () => {
    /* It read the same as staff-only on the board -- the staff list is not
       filtered by audience -- and it was the one value with nobody to notify,
       which the composer had to grey a checkbox out to explain. */
    expect(optionsOf(openComposer())).not.toContain('Admins only')
  })

  it('posts the chosen audience', async () => {
    const select = openComposer()
    fireEvent.change(select, { target: { value: 'families' } })
    fireEvent.change(screen.getByPlaceholderText('Early dismissal Friday'),
      { target: { value: 'Weekly newsletter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await vi.waitFor(() => expect(saveAnnouncement).toHaveBeenCalled())
    expect(saveAnnouncement.mock.calls[0][1]).toMatchObject({
      audience: 'families', title: 'Weekly newsletter',
    })
  })

  it('opens a post written for admins as staff only', () => {
    /* Editing sends the audience back with the rest of the form. A value the
       select no longer has would fall through to the default on save, which is
       every family -- the one mistake this column exists to prevent. */
    announcements.current = [{ id: 'a1', title: 'Payroll cutoff', audience: 'admins' }]
    render(<BoardAnnouncementsTab orgId="org-1" admin />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText(/Visible to/).value).toBe('teachers')
  })

  it('says on each posted item who can see it', () => {
    /* "not sure how to tell if teacher-only announcements show for parents
       too" (iCreate, 597ba9a4): the list showed a title and a date and no
       audience at all. A whole-school post needs no chip; a narrower one does. */
    announcements.current = [
      { id: 'a1', title: 'Payroll cutoff', audience: 'teachers' },
      { id: 'a2', title: 'Picture day', audience: 'families' },
      { id: 'a3', title: 'Assembly', audience: 'school' },
      { id: 'a4', title: 'Old admin note', audience: 'admins' },
    ]
    render(<BoardAnnouncementsTab orgId="org-1" admin />)
    // Scoped to the chips: the audience names also appear as options in the
    // list's own "Show" filter, which is a different control saying the same
    // words.
    const chip = { selector: 'span' }
    expect(screen.getAllByText('Staff only', chip)).toHaveLength(2)
    expect(screen.getByText('Families', chip)).toBeInTheDocument()
    expect(screen.getByText('Assembly').closest('div').textContent).not.toContain('Everyone at the school')
  })
})

// The reach used to render only inside "Also notify people", so an office
// that just posted to the board had to guess who "Everyone at the school"
// was -- "Does 'Everyone at School' include students too?" (iCreate,
// 2026-09-22, 745e2857). It is one audience for both acts, so it is named
// once, under the picker, and always.
describe('who the composer says a post reaches', () => {
  const reachFor = (audience) => {
    const select = openComposer()
    fireEvent.change(select, { target: { value: audience } })
    return screen.getByText(/^Goes to /).textContent
  }

  it('names the parents for a Families post', () => {
    expect(reachFor('families')).toBe('Goes to parents.')
  })

  it('answers the students question for a school-wide post', () => {
    expect(reachFor('school')).toBe('Goes to parents, students and teachers.')
  })

  it('names the teachers for a staff post', () => {
    expect(reachFor('teachers')).toBe('Goes to teachers.')
  })

  it('says so without waiting for "Also notify people" to be ticked', () => {
    openComposer()
    expect(screen.getByText(/^Goes to /)).toBeInTheDocument()
  })

  it('does not say the reach twice when notifying as well', () => {
    openComposer()
    fireEvent.click(screen.getByLabelText(/Also notify people/))
    expect(screen.getAllByText(/^Goes to /)).toHaveLength(1)
    expect(screen.getByText(/Sent to the same people the post is visible to/)).toBeInTheDocument()
  })
})

// "I thought we had it so the announcements could be sorted and collapsed?"
// (iCreate, 2026-09-22, d0a27882). The board returned pinned-first,
// newest-first and offered no control, and every notice rendered at full
// length however long it was.
describe('sorting and narrowing the board', () => {
  const four = [
    { id: 'a1', title: 'Beta', audience: 'teachers', created_at: '2026-09-01T00:00:00Z' },
    { id: 'a2', title: 'Alpha', audience: 'families', created_at: '2026-09-10T00:00:00Z' },
    { id: 'a3', title: 'Delta', audience: 'school', created_at: '2026-09-05T00:00:00Z' },
    { id: 'a4', title: 'Gamma', audience: 'families', created_at: '2026-09-20T00:00:00Z', pinned: true },
  ]
  const titlesShown = () =>
    [...document.querySelectorAll('h3')].map((h) => h.textContent)

  const board = (rows = four) => {
    announcements.current = rows
    render(<BoardAnnouncementsTab orgId="org-1" admin />)
  }

  it('offers no controls for a board of two', () => {
    board(four.slice(0, 2))
    expect(screen.queryByLabelText('Sort announcements')).toBeNull()
  })

  it('starts newest first', () => {
    board()
    expect(titlesShown()).toEqual(['Gamma', 'Alpha', 'Delta', 'Beta'])
  })

  it('sorts oldest first', () => {
    board()
    fireEvent.change(screen.getByLabelText('Sort announcements'), { target: { value: 'oldest' } })
    expect(titlesShown()).toEqual(['Gamma', 'Beta', 'Delta', 'Alpha'])
  })

  it('sorts by title', () => {
    board()
    fireEvent.change(screen.getByLabelText('Sort announcements'), { target: { value: 'title' } })
    expect(titlesShown()).toEqual(['Gamma', 'Alpha', 'Beta', 'Delta'])
  })

  // The office saying "read this first" is not a tie-break a sort may overrule.
  it('keeps a pinned notice on top of every order', () => {
    board()
    for (const value of ['newest', 'oldest', 'title']) {
      fireEvent.change(screen.getByLabelText('Sort announcements'), { target: { value } })
      expect(titlesShown()[0]).toBe('Gamma')
    }
  })

  it('narrows to one audience and says how many that is', () => {
    board()
    fireEvent.change(screen.getByLabelText('Filter announcements by audience'),
      { target: { value: 'families' } })
    expect(titlesShown()).toEqual(['Gamma', 'Alpha'])
    expect(screen.getByText('2 of 4')).toBeInTheDocument()
  })

  it('says so when a filter leaves nothing', () => {
    board()
    fireEvent.change(screen.getByLabelText('Filter announcements by audience'),
      { target: { value: 'teachers' } })
    fireEvent.change(screen.getByLabelText('Filter announcements by audience'),
      { target: { value: 'school' } })
    expect(titlesShown()).toEqual(['Delta'])
  })

  // A post written before the audience column, and one written for the retired
  // "admins only", both still have to land somewhere the filter can find.
  it('files a legacy admins post under Staff only', () => {
    board([...four, { id: 'a5', title: 'Old note', audience: 'admins', created_at: '2026-09-02T00:00:00Z' }])
    fireEvent.change(screen.getByLabelText('Filter announcements by audience'),
      { target: { value: 'teachers' } })
    expect(titlesShown()).toEqual(['Old note', 'Beta'])  // newest first
  })
})
