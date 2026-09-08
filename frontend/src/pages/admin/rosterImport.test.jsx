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

// The same two families, headerless and in Last, First order -- the shape that
// imported backwards and gave Hearthwood ~70 accounts with a surname for a
// first name.
const HEADERLESS_LAST_FIRST = [
  'Hennessy\tNoah\t27nhennessy@dsdmail.net\tHennessy\tMegan\tmhennessy@opened.co',
  'Hennessy\tAva\t29ahennessy@dsdmail.net\tHennessy\tMegan\tmhennessy@opened.co',
].join('\n')

const cell = (label, row) => screen.getByLabelText(`${label} row ${row}`)

const heading = label =>
  screen.getByRole('button', { name: new RegExp(`^${label} column`) })

const dragColumn = (fromLabel, toLabel) => {
  fireEvent.dragStart(heading(fromLabel),
    { dataTransfer: { setData: vi.fn(), effectAllowed: '' } })
  const target = heading(toLabel).closest('th')
  fireEvent.dragOver(target)
  fireEvent.drop(target)
}

const headingOrder = () =>
  Array.from(document.querySelectorAll('thead th [role="button"]'))
    .map(el => el.textContent.replace(/^\W+/, ''))

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

  it('reads a headerless paste against the order the columns are dragged into', () => {
    const order = ['student_last', 'student_first', 'student_email',
                   'parent_last', 'parent_first', 'parent_email']
    expect(parseRoster(HEADERLESS_LAST_FIRST, order)[0]).toEqual(expect.objectContaining({
      student_first: 'Noah', student_last: 'Hennessy',
      parent_first: 'Megan', parent_last: 'Hennessy',
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

  it('deletes every rejected row at once and drops the stale preview', async () => {
    const three = PASTED + '\n\tHennessy\tMia\tnot-an-email\tHennessy\tMegan\tmhennessy@opened.co'
    api.post.mockResolvedValueOnce({
      data: {
        ...PREVIEW,
        can_import: false,
        students: [student(3, 'Ava', '29ahennessy@dsdmail.net')],
        row_errors: [
          { row: 2, errors: ['"27nhennessy@dsdmail.net" already belongs to another student'] },
          { row: 4, errors: ['"not-an-email" is not a valid email address'] },
        ],
        counts: { ...PREVIEW.counts, rows: 3, students_new: 1, invalid_rows: 2 },
      },
    })
    await renderPage()
    pasteRoster(three)
    await previewIt()

    // Both the grid toolbar and the error banner offer it; one click is enough.
    const buttons = screen.getAllByRole('button', { name: 'Delete 2 rows with errors' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0])

    // Only the clean row (plus the trailing blank) survives, and the plan built
    // from the old rows is gone.
    expect(cell('Student first', 1)).toHaveValue('Ava')
    expect(cell('Student first', 2)).toHaveValue('')
    expect(screen.queryByLabelText('Student first row 3')).not.toBeInTheDocument()
    expect(screen.queryByText('Preview')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /with errors/ })).not.toBeInTheDocument()
  })

  it('leaves one blank row when every row had an error', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        ...PREVIEW,
        can_import: false,
        students: [],
        row_errors: [{ row: 2, errors: ['bad'] }, { row: 3, errors: ['bad'] }],
        counts: { ...PREVIEW.counts, students_new: 0, invalid_rows: 2 },
      },
    })
    await renderPage()
    pasteRoster()
    await previewIt()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete 2 rows with errors' })[0])

    expect(cell('Student first', 1)).toHaveValue('')
    expect(screen.queryByLabelText('Student first row 2')).not.toBeInTheDocument()
  })

  // Dragging a heading re-labels the sheet: the cells hold what the school
  // sent, and the heading says what it is. Hearthwood's roster arrived as
  // Last, First with no header row, imported clean, and put the surname in
  // every first_name -- there was nothing on this page to say otherwise.
  it('swaps two columns by dragging, and the cells stay where the school put them', async () => {
    await renderPage()
    pasteRoster(HEADERLESS_LAST_FIRST)

    // Read against our default order, the surname landed in the first column.
    expect(cell('Student first', 1)).toHaveValue('Hennessy')
    expect(cell('Student last', 1)).toHaveValue('Noah')

    dragColumn('Student last', 'Student first')

    expect(headingOrder().slice(0, 2)).toEqual(['Student last', 'Student first'])
    expect(cell('Student first', 1)).toHaveValue('Noah')
    expect(cell('Student last', 1)).toHaveValue('Hennessy')
    expect(cell('Student first', 2)).toHaveValue('Ava')
  })

  it('sends the canonical column order however the grid is arranged', async () => {
    await renderPage()
    pasteRoster(HEADERLESS_LAST_FIRST)
    dragColumn('Student last', 'Student first')
    dragColumn('Parent last', 'Parent first')
    await previewIt()

    expect(api.post).toHaveBeenCalledWith('/api/admin/roster-import/preview', {
      csv: SENT, organization_id: 'org-hearthwood',
    })
  })

  it('moves a column from the keyboard, for anyone not dragging with a mouse', async () => {
    await renderPage()
    pasteRoster(HEADERLESS_LAST_FIRST)
    fireEvent.keyDown(heading('Student first'), { key: 'ArrowRight' })

    expect(headingOrder().slice(0, 2)).toEqual(['Student last', 'Student first'])
    expect(cell('Student first', 1)).toHaveValue('Noah')
  })

  it('will not move the first column off the left edge', async () => {
    await renderPage()
    pasteRoster()
    fireEvent.keyDown(heading('Student first'), { key: 'ArrowLeft' })

    expect(headingOrder()[0]).toBe('Student first')
    expect(cell('Student first', 1)).toHaveValue('Noah')
  })

  it('puts the columns back, data and all', async () => {
    await renderPage()
    pasteRoster(HEADERLESS_LAST_FIRST)
    dragColumn('Student last', 'Student first')
    fireEvent.click(screen.getByRole('button', { name: 'Reset columns' }))

    expect(headingOrder().slice(0, 2)).toEqual(['Student first', 'Student last'])
    expect(cell('Student first', 1)).toHaveValue('Hennessy')
    expect(screen.queryByRole('button', { name: 'Reset columns' })).not.toBeInTheDocument()
  })

  it('drops the preview when a column moves, because the rows now mean something else',
    async () => {
      await renderPage()
      pasteRoster()
      await previewIt()
      expect(screen.getByRole('button', { name: /^Create 3 accounts/ })).toBeInTheDocument()

      dragColumn('Student last', 'Student first')

      expect(screen.queryByText('Preview')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Create/ })).not.toBeInTheDocument()
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
