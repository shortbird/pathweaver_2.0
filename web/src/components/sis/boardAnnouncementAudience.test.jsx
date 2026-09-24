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
 * So these assertions are about the answer being on the form: parents are an
 * audience, and the lines under the form state in words who that is. The
 * reach line is derived from the same table the checkboxes are, because the
 * server derives the send from this one choice -- a label that disagrees with
 * it is a lie about what Post does. Since 2026-09-23 (9a335881) a post names
 * any mix of parents, students and teachers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { announcements, saveAnnouncement, apiGet } = vi.hoisted(() => ({
  announcements: { current: [] },
  saveAnnouncement: vi.fn(async () => ({ data: {} })),
  apiGet: vi.fn(async () => ({ data: { people: [], presets: [] } })),
}))
vi.mock('../../services/api', () => ({ default: { get: apiGet } }))

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
  // "Who it is for" since ticket 214bbc12 (who, then where), and several roles
  // at once since 9a335881. The edit form says "Visible to".
  return screen.getByRole('group', { name: 'Who it is for' })
}

// The three single words the board used to offer, as the roles they are now.
const ROLE_LABELS = { parents: 'Parents', students: 'Students', teachers: 'Teachers and staff' }
const WORD_ROLES = { school: ['parents', 'students', 'teachers'], families: ['parents'], teachers: ['teachers'] }
const pick = (roles) => {
  const list = typeof roles === 'string' ? WORD_ROLES[roles] : roles
  list.forEach((r) => fireEvent.click(screen.getByRole('checkbox', { name: ROLE_LABELS[r] })))
}
const checksOf = (group) => [...group.querySelectorAll('label')].map((l) => l.textContent)

beforeEach(() => {
  announcements.current = []
  saveAnnouncement.mockClear()
  saveAnnouncement.mockImplementation(async () => ({ data: {} }))
  apiGet.mockClear()
})

describe('the audience a board post is written for', () => {
  it('offers the three roles, none of them ticked', () => {
    // A new post starts with no audience since ticket 2f945974 (see the
    // describe block below), and "Admins only" is gone: it read the same as
    // staff-only on the board and had nobody to notify.
    const group = openComposer()
    expect(checksOf(group)).toEqual(['Parents', 'Students', 'Teachers and staff'])
    group.querySelectorAll('input').forEach((box) => expect(box).not.toBeChecked())
  })

  it('posts the chosen roles, and the single word beside them', async () => {
    openComposer()
    pick('families')
    fireEvent.change(screen.getByPlaceholderText('Early dismissal Friday'),
      { target: { value: 'Weekly newsletter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await vi.waitFor(() => expect(saveAnnouncement).toHaveBeenCalled())
    expect(saveAnnouncement.mock.calls[0][1]).toMatchObject({
      audiences: ['parents'], audience: 'families', title: 'Weekly newsletter',
    })
  })

  // 9a335881: "announcements should have multi-role select options".
  it('posts a mix the single word could not say', async () => {
    openComposer()
    pick(['students', 'teachers'])
    fireEvent.change(screen.getByPlaceholderText('Early dismissal Friday'),
      { target: { value: 'Robotics tryouts' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await vi.waitFor(() => expect(saveAnnouncement).toHaveBeenCalled())
    expect(saveAnnouncement.mock.calls[0][1]).toMatchObject({
      audiences: ['students', 'teachers'], audience: 'school',
    })
  })

  it('opens a post written for admins as staff only', () => {
    /* Editing sends the roles back with the rest of the form. A value the
       form no longer has would fall through to the default on save, which is
       every family -- the one mistake this column exists to prevent. */
    announcements.current = [{ id: 'a1', title: 'Payroll cutoff', audience: 'admins' }]
    render(<BoardAnnouncementsTab orgId="org-1" admin />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const group = screen.getByRole('group', { name: 'Visible to' })
    expect(within(group).getByRole('checkbox', { name: 'Teachers and staff' })).toBeChecked()
    expect(within(group).getByRole('checkbox', { name: 'Parents' })).not.toBeChecked()
  })

  it('opens a post with stored roles as those roles', () => {
    announcements.current = [{ id: 'a1', title: 'x', audience: 'school', audiences: ['students'] }]
    render(<BoardAnnouncementsTab orgId="org-1" admin />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const group = screen.getByRole('group', { name: 'Visible to' })
    expect(within(group).getByRole('checkbox', { name: 'Students' })).toBeChecked()
    expect(within(group).getByRole('checkbox', { name: 'Parents' })).not.toBeChecked()
  })

  // 9b46c748: read counts existed for a post's send; the board never showed them.
  it('says how many of the people a post was sent to have read it', () => {
    announcements.current = [
      { id: 'a1', title: 'Picture day', audience: 'school', read_count: 12, recipient_count: 40 },
      { id: 'a2', title: 'Board only', audience: 'school' },
    ]
    render(<BoardAnnouncementsTab orgId="org-1" admin />)
    expect(screen.getByText(/Read by 12 of 40/)).toBeInTheDocument()
    expect(screen.getByText('Board only').closest('div').parentElement.textContent).not.toContain('Read by')
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
    expect(screen.getByText('Assembly').closest('div').textContent).not.toContain('Staff only')
  })
})

// The reach used to render only inside "Also notify people", so an office
// that just posted to the board had to guess who "Everyone at the school"
// was -- "Does 'Everyone at School' include students too?" (iCreate,
// 2026-09-22, 745e2857). Since ticket 214bbc12 the composer says WHERE as well
// as who, so the line under the picker says what Post does for each place
// ticked. These replace the old "Goes to ..." assertions on the new composer;
// the edit form still says "Goes to", because it only changes the post.
describe('who the composer says a post reaches', () => {
  const linesFor = (audience) => {
    openComposer()
    pick(audience)
    return [...screen.getByRole('list', { name: 'What Post will do' }).querySelectorAll('li')]
      .map((li) => li.textContent)
  }

  it('names the parents for a Families post', () => {
    expect(linesFor('families')).toEqual(['Posts on the community board for parents.'])
  })

  it('answers the students question for a school-wide post', () => {
    expect(linesFor('school')).toEqual(['Posts on the community board for parents, students and teachers.'])
  })

  it('puts a staff post on the staff board', () => {
    expect(linesFor('teachers')).toEqual(['Posts on the staff board, where every staff member can read it.'])
  })

  it('still says Goes to on the edit form', () => {
    announcements.current = [{ id: 'a1', title: 'Picture day', audience: 'families' }]
    render(<BoardAnnouncementsTab orgId="org-1" admin />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByText(/^Goes to /).textContent).toBe('Goes to parents.')
  })

  it('names a mix in words', () => {
    expect(linesFor(['parents', 'students'])).toEqual(['Posts on the community board for parents and students.'])
  })
})

// Ticket 214bbc12 (iCreate, Molly, 2026-09-22): "I really think this needs to
// be bulk messaging and not just announcements. I want to be able to message
// just SOME of the teachers, not all of them. (and to filter people.) ... see
// options of where it could go: Community Announcement Board; Teacher & Staff
// Announcement board; Optio Message inbox; Email."
describe('where a notice goes', () => {
  const box = (name) => screen.getByRole('checkbox', { name: new RegExp(`^${name}`) })
  const lines = () => [...screen.getByRole('list', { name: 'What Post will do' }).querySelectorAll('li')]
    .map((li) => li.textContent)
  const titled = (title = 'Gate code') => fireEvent.change(
    screen.getByPlaceholderText('Early dismissal Friday'), { target: { value: title } })
  const submit = async (name = 'Post') => {
    fireEvent.click(screen.getByRole('button', { name }))
    await vi.waitFor(() => expect(saveAnnouncement).toHaveBeenCalled())
    return saveAnnouncement.mock.calls[0][1]
  }

  it('offers the four places, in one composer', () => {
    openComposer()
    for (const name of ['Community board', 'Staff board', 'Optio inbox', 'Email']) {
      expect(box(name)).toBeInTheDocument()
    }
    expect(screen.getAllByRole('button', { name: /^(Post|Send)$/ })).toHaveLength(1)
  })

  it('starts on the community board and sends that alone', async () => {
    // The audience is picked here because a new post no longer has one until
    // somebody chooses (2f945974); this test was written against the old
    // 'school' default and is about the destination, not the audience.
    openComposer()
    pick('school')
    titled()
    expect(await submit()).toMatchObject({ destinations: ['community_board'], audience: 'school' })
  })

  it('sends each destination alone', async () => {
    for (const [audience, dest, button] of [
      ['teachers', 'Staff board', 'Post'],
      ['teachers', 'Optio inbox', 'Send'],
      ['school', 'Email', 'Send'],
    ]) {
      saveAnnouncement.mockClear()
      const { unmount } = render(<BoardAnnouncementsTab orgId="org-1" admin />)
      fireEvent.click(screen.getByRole('button', { name: 'Post announcement' }))
      pick(audience)
      if (dest !== 'Staff board') fireEvent.click(box(audience === 'teachers' ? 'Staff board' : 'Community board'))
      if (dest !== 'Staff board') fireEvent.click(box(dest))
      titled()
      const payload = await submit(button)
      const wire = { 'Staff board': 'staff_board', 'Optio inbox': 'inbox', Email: 'email' }[dest]
      expect(payload.destinations).toEqual([wire])
      unmount()
    }
  })

  it('sends them combined, and says what each will do', async () => {
    // Whole school chosen explicitly: it used to be the default (2f945974).
    openComposer()
    pick('school')
    fireEvent.click(box('Optio inbox'))
    fireEvent.click(box('Email'))
    fireEvent.click(screen.getByLabelText(/Also send an app notification/))
    expect(lines()).toEqual([
      'Posts on the community board for parents, students and teachers.',
      'Sends an app notification to parents, students and teachers.',
      'Sends a private message to every staff member in their Optio inbox.',
      'Families get no inbox message from here. Use Compose on the Messaging page for that.',
      'Emails parents, students and teachers.',
    ])
    titled()
    expect(await submit()).toMatchObject({
      destinations: ['community_board', 'inbox', 'email'], notify_app: true,
    })
  })

  it('refuses to send with no destination', () => {
    openComposer()
    pick('school')
    fireEvent.click(box('Community board'))
    expect(lines()).toEqual(['Choose at least one place to send it.'])
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('never offers the inbox for families, and says where to go instead', () => {
    openComposer()
    pick('families')
    expect(box('Optio inbox')).toBeDisabled()
    expect(screen.getByText('Families are messaged from Compose on the Messaging page, not from here.')).toBeInTheDocument()
  })

  it('moves a staff post to the staff board, which is the same board', () => {
    openComposer()
    pick('teachers')
    expect(box('Community board')).toBeDisabled()
    expect(box('Staff board')).toBeChecked()
  })

  it('narrows a staff send to the people picked and passes their ids', async () => {
    apiGet.mockResolvedValueOnce({ data: { people: [
      { id: 's1', name: 'Ada Teacher', role_labels: ['Teacher'] },
      { id: 's2', name: 'Sam Teacher', role_labels: ['Teacher'] },
      { id: 's3', name: 'Kim Office', role_labels: ['Admin'] },
    ] } })
    openComposer()
    pick('teachers')
    fireEvent.click(box('Staff board'))
    fireEvent.click(box('Optio inbox'))
    fireEvent.click(screen.getByLabelText('Only some staff'))
    await screen.findByLabelText('Select Ada Teacher')
    expect(apiGet.mock.calls[0][0]).toContain('/api/sis/messaging/recipients')
    fireEvent.click(screen.getByLabelText('Select Ada Teacher'))
    fireEvent.click(screen.getByLabelText('Select Kim Office'))
    expect(lines()).toEqual(['Sends a private message to the 2 staff members you chose in their Optio inbox.'])
    titled()
    const payload = await submit('Send')
    expect(payload).toMatchObject({ audience: 'teachers', destinations: ['inbox'] })
    expect(payload.staff_ids.sort()).toEqual(['s1', 's3'])
  })

  it('warns that the staff board reaches everyone when people are picked', async () => {
    openComposer()
    pick('teachers')
    fireEvent.click(screen.getByLabelText('Only some staff'))
    expect(screen.getByText(/Every staff member reads the staff board/)).toBeInTheDocument()
  })

  it('does not send destinations when editing a post', async () => {
    announcements.current = [{ id: 'a1', title: 'Picture day', audience: 'families' }]
    render(<BoardAnnouncementsTab orgId="org-1" admin />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(saveAnnouncement).toHaveBeenCalled())
    expect(saveAnnouncement.mock.calls[0][1]).not.toHaveProperty('destinations')
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

  // A role filter shows what that role reads: parents read the whole-school
  // post too.
  it('narrows to one role and says how many that is', () => {
    board()
    fireEvent.change(screen.getByLabelText('Filter announcements by audience'),
      { target: { value: 'parents' } })
    expect(titlesShown()).toEqual(['Gamma', 'Alpha', 'Delta'])
    expect(screen.getByText('3 of 4')).toBeInTheDocument()
  })

  it('shows the students only what names them', () => {
    board()
    fireEvent.change(screen.getByLabelText('Filter announcements by audience'),
      { target: { value: 'students' } })
    expect(titlesShown()).toEqual(['Delta'])
  })

  // A post written before the audience column, and one written for the retired
  // "admins only", both still have to land somewhere the filter can find.
  it('files a legacy admins post under Staff only', () => {
    board([...four, { id: 'a5', title: 'Old note', audience: 'admins', created_at: '2026-09-02T00:00:00Z' }])
    fireEvent.change(screen.getByLabelText('Filter announcements by audience'),
      { target: { value: 'teachers' } })
    // Staff read the whole-school post as well.
    expect(titlesShown()).toEqual(['Delta', 'Old note', 'Beta'])  // newest first
  })
})

// Ticket 2f945974 (2026-09-22): a parent announcement appeared on the student
// board. The composer started on "Everyone at the school", so a post meant for
// parents reached students unless the poster remembered to change it. Now a
// new post has no audience until one is picked, and Post stays off until then.
describe('no default audience (2f945974)', () => {
  const titled = () => fireEvent.change(
    screen.getByPlaceholderText('Early dismissal Friday'), { target: { value: 'Gate code' } })

  it('starts with no audience chosen and Post disabled', () => {
    const group = openComposer()
    group.querySelectorAll('input').forEach((b) => expect(b).not.toBeChecked())
    titled()
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled()
    const lines = [...screen.getByRole('list', { name: 'What Post will do' }).querySelectorAll('li')]
      .map((li) => li.textContent)
    expect(lines).toEqual(['Choose who it is for.'])
  })

  it('says that students see a post only when they are ticked', () => {
    openComposer()
    expect(screen.getByText(/Students see a post only when Students is ticked/)).toBeInTheDocument()
  })

  it.each([
    ['school', 'Post'],
    ['families', 'Post'],
    ['teachers', 'Post'],
  ])('enables Post once %s is chosen and sends that audience', async (audience, button) => {
    openComposer()
    pick(audience)
    titled()
    const post = screen.getByRole('button', { name: button })
    expect(post).not.toBeDisabled()
    fireEvent.click(post)
    await vi.waitFor(() => expect(saveAnnouncement).toHaveBeenCalled())
    expect(saveAnnouncement.mock.calls[0][1].audience).toBe(audience)
  })
})
