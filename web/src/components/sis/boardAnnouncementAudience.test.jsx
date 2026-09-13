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
})

describe('what "Also notify people" says it will do', () => {
  const reachAfterTicking = (audience) => {
    const select = openComposer()
    fireEvent.change(select, { target: { value: audience } })
    fireEvent.click(screen.getByLabelText(/Also notify people/))
    return screen.getByText(/^Goes to /).textContent
  }

  it('names the parents for a Families post', () => {
    expect(reachAfterTicking('families')).toBe('Goes to parents.')
  })

  it('names everybody for a school-wide post', () => {
    expect(reachAfterTicking('school')).toBe('Goes to parents, students and teachers.')
  })

  it('names the teachers for a staff post', () => {
    expect(reachAfterTicking('teachers')).toBe('Goes to teachers.')
  })

  it('says nothing until the box is ticked', () => {
    openComposer()
    expect(screen.queryByText(/^Goes to /)).toBeNull()
  })
})
