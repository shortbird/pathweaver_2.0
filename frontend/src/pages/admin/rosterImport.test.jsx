import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * Roster Import — a school's spreadsheet becomes accounts, links and invites.
 *
 * The grid has to behave like the spreadsheet it came from: one paste fills the
 * whole sheet regardless of header spelling or stray columns, and a bad cell is
 * fixed in place.
 *
 * The rest is about not creating accounts for real families by accident:
 * importing is only reachable through a preview of the exact rows in the grid,
 * editing any cell takes that button away again, and a roster with bad rows
 * offers no import at all.
 */

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import RosterImportPage, { parseRoster } from './RosterImportPage'

const ORGS = [
  { id: 'org-other', name: 'Arete Academy', slug: 'arete' },
  { id: 'org-hearthwood', name: 'Hearthwood Academy', slug: 'hearthwood' },
]

// Pasted straight out of the school's sheet: tab-separated, with a User ID
// column we don't use.
const PASTED = [
  'User ID\tStudent Last Name\tStudent First Name\tStudent Email\tParent Last Name\tParent First Name\tParent Email',
  '\tHennessy\tNoah\t27nhennessy@dsdmail.net\tHennessy\tMegan\tmhennessy@opened.co',
  '\tHennessy\tAva\t29ahennessy@dsdmail.net\tHennessy\tMegan\tmhennessy@opened.co',
].join('\n')

// What the grid sends back: our own column order, header included.
const SENT = [
  'Student First Name\tStudent Last Name\tStudent Email\tParent First Name\tParent Last Name\tParent Email',
  'Noah\tHennessy\t27nhennessy@dsdmail.net\tMegan\tHennessy\tmhennessy@opened.co',
  'Ava\tHennessy\t29ahennessy@dsdmail.net\tMegan\tHennessy\tmhennessy@opened.co',
].join('\n')

const student = (row, first, email, extra = {}) => ({
  row, email, first_name: first, last_name: 'Hennessy',
  parent_email: 'mhennessy@opened.co', status: 'create',
  existing_user_id: null, other_org: false, ...extra,
})

const PREVIEW = {
  success: true,
  can_import: true,
  organization: { id: 'org-hearthwood', name: 'Hearthwood Academy' },
  students: [student(2, 'Noah', '27nhennessy@dsdmail.net'),
             student(3, 'Ava', '29ahennessy@dsdmail.net')],
  parents: [{
    row: 2, email: 'mhennessy@opened.co', first_name: 'Megan', last_name: 'Hennessy',
    status: 'create', existing_user_id: null, other_org: false,
    student_emails: ['27nhennessy@dsdmail.net', '29ahennessy@dsdmail.net'],
  }],
  row_errors: [],
  warnings: [],
  counts: {
    rows: 2, students_new: 2, students_existing: 0, parents_new: 1,
    parents_existing: 0, links: 2, invalid_rows: 0,
  },
}

const COMMIT = {
  success: true,
  organization: { id: 'org-hearthwood', name: 'Hearthwood Academy' },
  counts: { created: 3, existing: 0, failed: 0, invited: 3, linked: 2 },
  results: [
    { row: 2, kind: 'parent', email: 'mhennessy@opened.co', name: 'Megan Hennessy', status: 'created', invited: true },
    { row: 2, kind: 'student', email: '27nhennessy@dsdmail.net', name: 'Noah Hennessy', status: 'created', invited: true, linked_to: 'mhennessy@opened.co' },
    { row: 3, kind: 'student', email: '29ahennessy@dsdmail.net', name: 'Ava Hennessy', status: 'created', invited: true, linked_to: 'mhennessy@opened.co' },
  ],
}

const cell = (label, row) => screen.getByLabelText(`${label} row ${row}`)

const pasteRoster = (text = PASTED) =>
  fireEvent.paste(cell('Student first', 1), {
    clipboardData: { getData: () => text },
  })

const renderPage = async () => {
  render(<RosterImportPage />)
  await screen.findByRole('option', { name: 'Hearthwood Academy' })
}

const previewIt = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Preview import' }))
  await screen.findByText('Preview')
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { organizations: ORGS } })
  api.post.mockImplementation((url) =>
    Promise.resolve({ data: url.endsWith('/preview') ? PREVIEW : COMMIT }))
})

describe('parseRoster', () => {
  it('maps columns by header, so a User ID column and odd ordering are handled', () => {
    expect(parseRoster(PASTED)).toEqual([
      expect.objectContaining({ student_first: 'Noah', student_last: 'Hennessy',
        student_email: '27nhennessy@dsdmail.net', parent_first: 'Megan',
        parent_last: 'Hennessy', parent_email: 'mhennessy@opened.co' }),
      expect.objectContaining({ student_first: 'Ava' }),
    ])
  })

  it('reads the same roster saved as comma-separated, quotes and all', () => {
    const text = ['Student First Name,Student Last Name,Student Email,Parent Email',
                  'Noah,"Hennessy, Jr.",27nhennessy@dsdmail.net,mhennessy@opened.co'].join('\n')
    expect(parseRoster(text)[0]).toEqual(expect.objectContaining({
      student_last: 'Hennessy, Jr.', student_email: '27nhennessy@dsdmail.net',
    }))
  })

  it('falls back to column order when the paste has no header row', () => {
    const text = 'Noah\tHennessy\t27nhennessy@dsdmail.net\tMegan\tHennessy\tmhennessy@opened.co'
    expect(parseRoster(text)[0]).toEqual(expect.objectContaining({
      student_first: 'Noah', parent_email: 'mhennessy@opened.co',
    }))
  })
})

describe('RosterImportPage', () => {
  it('defaults to Hearthwood, the school that sends rosters', async () => {
    await renderPage()
    expect(screen.getByLabelText('Organization')).toHaveValue('org-hearthwood')
  })

  it('fills the whole grid from one paste', async () => {
    await renderPage()
    pasteRoster()

    expect(cell('Student first', 1)).toHaveValue('Noah')
    expect(cell('Student email', 1)).toHaveValue('27nhennessy@dsdmail.net')
    expect(cell('Student first', 2)).toHaveValue('Ava')
    expect(cell('Parent first', 2)).toHaveValue('Megan')
  })

  it('will not preview until there is both an organization and a row', async () => {
    await renderPage()
    const previewButton = screen.getByRole('button', { name: 'Preview import' })
    expect(previewButton).toBeDisabled()

    pasteRoster()
    expect(previewButton).toBeEnabled()

    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: '' } })
    expect(previewButton).toBeDisabled()
  })

  it('sends the grid as a roster, shows what it would do, then does it', async () => {
    await renderPage()
    pasteRoster()
    await previewIt()

    expect(api.post).toHaveBeenCalledWith('/api/admin/roster-import/preview', {
      csv: SENT, organization_id: 'org-hearthwood',
    })
    // Megan is one parent account for two students, not two.
    expect(screen.getByText('New parents').previousSibling).toHaveTextContent('1')
    expect(screen.getByText('Parent links').previousSibling).toHaveTextContent('2')

    fireEvent.click(screen.getByRole('button', { name: 'Create 3 accounts in Hearthwood Academy' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/roster-import/commit',
      { csv: SENT, organization_id: 'org-hearthwood', send_emails: true },
    ))
    // The completion names the org, because that is where the accounts are
    // findable and the selector is easy to skip past.
    expect(await screen.findByText(/Import complete .* Hearthwood Academy/)).toBeInTheDocument()
    expect(screen.getByText('Emails sent').previousSibling).toHaveTextContent('3')
  })

  it('drops the preview when any cell is edited, so the plan always matches the grid', async () => {
    await renderPage()
    pasteRoster()
    await previewIt()
    expect(screen.getByRole('button', { name: /^Create 3 accounts/ })).toBeInTheDocument()

    fireEvent.change(cell('Student email', 2), { target: { value: 'ava@dsdmail.net' } })

    expect(screen.queryByRole('button', { name: /^Create/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Preview')).not.toBeInTheDocument()
  })

  it('lets the superadmin create the accounts without emailing anyone', async () => {
    await renderPage()
    pasteRoster()
    await previewIt()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /^Create 3 accounts/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/roster-import/commit',
      expect.objectContaining({ send_emails: false }),
    ))
  })

  it('marks the offending row so a bad cell is fixed in place, and blocks the import', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        ...PREVIEW,
        can_import: false,
        students: [student(2, 'Noah', '27nhennessy@dsdmail.net')],
        row_errors: [{ row: 3, student_email: 'not-an-email',
                       errors: ['"not-an-email" is not a valid email address'] }],
        counts: { ...PREVIEW.counts, students_new: 1, invalid_rows: 1 },
      },
    })
    await renderPage()
    pasteRoster()
    await previewIt()

    // The error names the second grid row, not "row 3" of some text the
    // superadmin can no longer see.
    const secondRow = cell('Student first', 2).closest('tr')
    expect(secondRow).toHaveClass('bg-red-50')
    expect(await screen.findByText('"not-an-email" is not a valid email address')).toBeInTheDocument()
    expect(cell('Student first', 1).closest('tr')).not.toHaveClass('bg-red-50')
    expect(screen.queryByRole('button', { name: /^Create/ })).not.toBeInTheDocument()
  })

  it('distinguishes an existing member from one about to join the org', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        ...PREVIEW,
        students: [student(2, 'Noah', '27nhennessy@dsdmail.net',
                           { status: 'existing', existing_user_id: 'u1' }),
                   student(3, 'Ava', '29ahennessy@dsdmail.net',
                           { status: 'adopt', existing_user_id: 'u2' })],
        warnings: ['1 existing Optio account(s) will be added to this organization: ' +
                   '29ahennessy@dsdmail.net'],
        counts: { ...PREVIEW.counts, students_new: 0, students_existing: 2, adopted: 1 },
      },
    })
    await renderPage()
    pasteRoster()
    await previewIt()

    expect(within(cell('Student first', 1).closest('tr')).getByText('Exists')).toBeInTheDocument()
    expect(within(cell('Student first', 2).closest('tr')).getByText('Joins org')).toBeInTheDocument()
    // Joining an org changes an account somebody else already uses, so it is
    // stated up front rather than discovered afterwards.
    expect(screen.getByText(/will be added to this organization/)).toBeInTheDocument()
  })

  it('shows a student with no email as a parent-managed profile', async () => {
    api.post.mockImplementation(url => Promise.resolve({
      data: url.endsWith('/preview')
        ? {
            ...PREVIEW,
            students: [student(2, 'Noah', null, { dependent: true }),
                       student(3, 'Ava', '29ahennessy@dsdmail.net')],
            warnings: ['1 student(s) have no email and will be created as parent-managed ' +
                       'profiles. They will not get an invite email; their parent signs in ' +
                       'and manages them.'],
            counts: { ...PREVIEW.counts, students_new: 2, dependents_new: 1 },
          }
        : {
            ...COMMIT,
            counts: { ...COMMIT.counts, invited: 2 },
            results: [COMMIT.results[0],
                      { row: 2, kind: 'student', email: null, name: 'Noah Hennessy',
                        status: 'created', invited: false, dependent: true,
                        linked_to: 'mhennessy@opened.co' },
                      COMMIT.results[2]],
          },
    }))
    await renderPage()
    pasteRoster()
    await previewIt()

    // The row says what it becomes, the counts say how many, and the warning
    // says no invite is coming for them.
    expect(within(cell('Student first', 1).closest('tr')).getByText('managed profile'))
      .toBeInTheDocument()
    expect(screen.getByText('Managed profiles').previousSibling).toHaveTextContent('1')
    expect(screen.getByText(/will not get an invite email/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Create 3 accounts/ }))
    expect(await screen.findByText('managed profile — no email, parent signs in'))
      .toBeInTheDocument()
  })

  it('warns when new accounts were created but not emailed', async () => {
    api.post.mockImplementation(url => Promise.resolve({
      data: url.endsWith('/preview') ? PREVIEW
        : { ...COMMIT, counts: { ...COMMIT.counts, invited: 0 } },
    }))
    await renderPage()
    pasteRoster()
    await previewIt()
    fireEvent.click(screen.getByRole('button', { name: /^Create 3 accounts/ }))

    // "3 created" reads as success at a glance; nobody was told how to log in.
    expect(await screen.findByText(/3 of 3 new\s+accounts were not emailed/))
      .toBeInTheDocument()
  })

  it('removes a row without disturbing the others', async () => {
    await renderPage()
    pasteRoster()
    fireEvent.click(screen.getByLabelText('Remove row 1'))

    expect(cell('Student first', 1)).toHaveValue('Ava')
  })

  it('surfaces a rejected request instead of leaving the page looking successful', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { error: 'Organization not found' } } })
    await renderPage()
    pasteRoster()
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }))

    expect(await screen.findByText('Organization not found')).toBeInTheDocument()
    expect(screen.queryByText('Preview')).not.toBeInTheDocument()
  })
})
