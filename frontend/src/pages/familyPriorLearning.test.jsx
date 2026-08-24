/**
 * Prior learning — the guardian's side, document-first.
 *
 * A parent emptying a shoebox of paperwork should get all of it up in one go, so
 * what's tested is the bulk path: many files staged at once, an optional note per
 * file, one send. The properties that would hurt a parent if wrong are filing
 * against the wrong child, being told "sent" when nothing uploaded, and losing a
 * note they took the trouble to write.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../services/api', () => ({ default: api }))

import FamilyPriorLearningPage from './FamilyPriorLearningPage'
import { cardsFor } from './SchoolPage'
import { OPTIO_ACADEMY_ORG_ID } from '../config/optioAcademy'

const TWO_KIDS = [
  { student_id: 'kid-1', name: 'Ada Byron' },
  { student_id: 'kid-2', name: 'Linus Byron' },
]

const file = (name, type = 'application/pdf') => new File(['x'], name, { type })

const mockPage = ({ records = [], students = TWO_KIDS } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/parent/context')) {
      return Promise.resolve({
        data: { orgs: [{ organization_id: 'org-1', organization_name: 'Optio Academy' }] },
      })
    }
    if (url.includes('/parent/prior-learning')) {
      return Promise.resolve({ data: { records, students } })
    }
    return Promise.resolve({ data: {} })
  })
}

/** Create-record resolves with an id; evidence and submit resolve empty. */
const mockSendOk = () => api.post.mockImplementation((url) => (
  url.endsWith('/prior-learning')
    ? Promise.resolve({ data: { record: { id: 'rec-9' } } })
    : Promise.resolve({ data: {} })
))

const stage = async (...files) => {
  await userEvent.upload(await screen.findByLabelText(/choose documents to upload/i), files)
}

/** Drag-and-drop onto the zone — the path `accept` does not police. */
const drop = async (...files) => {
  const zone = (await screen.findByText(/drag your documents here/i)).closest('div')
  fireEvent.drop(zone, { dataTransfer: { files, types: ['Files'] } })
}

const evidencePosts = () => api.post.mock.calls.filter(([url]) => url.includes('/evidence'))

beforeEach(() => vi.clearAllMocks())

describe('uploading in bulk', () => {
  it('stages every file dropped in at once, not one at a time', async () => {
    mockPage({ students: [TWO_KIDS[0]] })
    render(<FamilyPriorLearningPage />)

    await stage(file('transcript.pdf'), file('report-card.pdf'), file('recital.jpg', 'image/jpeg'))

    expect(await screen.findByText(/3 documents ready to send/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send 3 documents/i })).toBeInTheDocument()
  })

  it('uploads nothing until Send, so a parent can still change their mind', async () => {
    mockPage({ students: [TWO_KIDS[0]] })
    render(<FamilyPriorLearningPage />)

    await stage(file('transcript.pdf'))

    expect(api.post).not.toHaveBeenCalled()
  })

  it('lets a staged file be taken back out', async () => {
    mockPage({ students: [TWO_KIDS[0]] })
    render(<FamilyPriorLearningPage />)

    await stage(file('keep.pdf'), file('oops.pdf'))
    await userEvent.click(await screen.findByRole('button', { name: /remove oops\.pdf/i }))

    expect(screen.getByText(/1 document ready to send/i)).toBeInTheDocument()
    expect(screen.queryByText('oops.pdf')).not.toBeInTheDocument()
  })

  it('sends one record with one upload per document, then submits it', async () => {
    mockPage({ students: [TWO_KIDS[0]] })
    mockSendOk()
    render(<FamilyPriorLearningPage />)

    await stage(file('a.pdf'), file('b.pdf'))
    await userEvent.click(screen.getByRole('button', { name: /send 2 documents/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(4)) // create + 2 files + submit
    expect(evidencePosts()).toHaveLength(2)
    expect(api.post.mock.calls.at(-1)[0]).toContain('/submit')
  })

  it('photos go up as image evidence so the portfolio can show them', async () => {
    mockPage({ students: [TWO_KIDS[0]] })
    mockSendOk()
    render(<FamilyPriorLearningPage />)

    await stage(file('project.jpg', 'image/jpeg'), file('transcript.pdf'))
    await userEvent.click(screen.getByRole('button', { name: /send 2 documents/i }))

    await waitFor(() => expect(evidencePosts()).toHaveLength(2))
    const kinds = evidencePosts().map(([, body]) => body.get('evidence_type'))
    expect(kinds).toEqual(['image', 'document'])
  })
})

describe('file types a parent actually has', () => {
  it('accepts a CSV export, which is what another school hands you', async () => {
    mockPage({ students: [TWO_KIDS[0]] })
    mockSendOk()
    render(<FamilyPriorLearningPage />)

    await stage(file('skill-struck-export.csv', 'text/csv'))
    await userEvent.click(await screen.findByRole('button', { name: /send 1 document/i }))

    await waitFor(() => expect(evidencePosts()).toHaveLength(1))
    expect(toast.error).not.toHaveBeenCalled()
  })

  // The file picker filters by the input's `accept` list, so these two exercise
  // the DRAG path — where the browser hands over whatever was dropped and the
  // page itself has to turn the unusable ones away.
  it('turns a dropped unusable file away at the door, by name', async () => {
    mockPage({ students: [TWO_KIDS[0]] })
    render(<FamilyPriorLearningPage />)

    await drop(file('notes.pages', 'application/x-iwork-pages-sffpages'))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('notes.pages')))
    // Never staged, so the count can't promise something that won't be sent.
    expect(screen.queryByText(/ready to send/i)).not.toBeInTheDocument()
  })

  it('keeps the good files when one in a dropped batch is unusable', async () => {
    mockPage({ students: [TWO_KIDS[0]] })
    render(<FamilyPriorLearningPage />)

    await drop(file('transcript.pdf'), file('notes.pages', 'application/octet-stream'))

    expect(await screen.findByText(/1 document ready to send/i)).toBeInTheDocument()
  })

  it('passes the server’s reason through when it refuses one anyway', async () => {
    mockPage({ students: [TWO_KIDS[0]] })
    api.post.mockImplementation((url) => {
      if (url.endsWith('/prior-learning')) return Promise.resolve({ data: { record: { id: 'rec-9' } } })
      if (url.includes('/evidence')) {
        return Promise.reject({ response: { data: { error: "File extension '.pdf' not allowed" } } })
      }
      return Promise.resolve({ data: {} })
    })
    render(<FamilyPriorLearningPage />)

    await stage(file('transcript.pdf'))
    await userEvent.click(screen.getByRole('button', { name: /send 1 document/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("File extension '.pdf' not allowed")))
  })
})

describe('the note on each document', () => {
  it('is optional — a parent sending twelve things owes no captions', async () => {
    mockPage({ students: [TWO_KIDS[0]] })
    mockSendOk()
    render(<FamilyPriorLearningPage />)

    await stage(file('a.pdf'))
    await userEvent.click(screen.getByRole('button', { name: /send 1 document/i }))

    await waitFor(() => expect(evidencePosts()).toHaveLength(1))
    expect(evidencePosts()[0][1].get('note')).toBe('')
  })

  it('travels with the document it was written against', async () => {
    mockPage({ students: [TWO_KIDS[0]] })
    mockSendOk()
    render(<FamilyPriorLearningPage />)

    await stage(file('first.pdf'), file('second.pdf'))
    await userEvent.type(await screen.findByLabelText(/what is second\.pdf/i), '10th grade biology')
    await userEvent.click(screen.getByRole('button', { name: /send 2 documents/i }))

    await waitFor(() => expect(evidencePosts()).toHaveLength(2))
    const notes = evidencePosts().map(([, body]) => body.get('note'))
    expect(notes).toEqual(['', '10th grade biology'])
  })
})

describe('choosing which child', () => {
  it('does not ask a parent of one child a question with one answer', async () => {
    mockPage({ students: [TWO_KIDS[0]] })
    render(<FamilyPriorLearningPage />)

    await screen.findByText(/drag your documents here/i)
    expect(screen.queryByLabelText(/who are these for/i)).not.toBeInTheDocument()
  })

  it('asks when there are several, and files against the one picked', async () => {
    mockPage()
    mockSendOk()
    render(<FamilyPriorLearningPage />)

    await screen.findByRole('option', { name: 'Linus Byron' })
    await userEvent.selectOptions(screen.getByLabelText(/who are these for/i), 'kid-2')
    await stage(file('a.pdf'))
    await userEvent.click(screen.getByRole('button', { name: /send 1 document/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].student_user_id).toBe('kid-2')
  })

  it('sends nothing until a child is chosen', async () => {
    mockPage()
    render(<FamilyPriorLearningPage />)

    await stage(file('a.pdf'))
    await userEvent.click(await screen.findByRole('button', { name: /send 1 document/i }))

    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('when uploads fail', () => {
  it('never says "sent" if not one document made it', async () => {
    mockPage({ students: [TWO_KIDS[0]] })
    api.post.mockImplementation((url) => {
      if (url.endsWith('/prior-learning')) return Promise.resolve({ data: { record: { id: 'rec-9' } } })
      if (url.includes('/evidence')) return Promise.reject(new Error('network'))
      return Promise.resolve({ data: {} })
    })
    render(<FamilyPriorLearningPage />)

    await stage(file('a.pdf'))
    await userEvent.click(screen.getByRole('button', { name: /send 1 document/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
    // Nothing landed, so nothing was submitted for review.
    expect(api.post.mock.calls.some(([url]) => url.includes('/submit'))).toBe(false)
  })

  it('names the ones that failed when only some did', async () => {
    mockPage({ students: [TWO_KIDS[0]] })
    api.post.mockImplementation((url, body) => {
      if (url.endsWith('/prior-learning')) return Promise.resolve({ data: { record: { id: 'rec-9' } } })
      if (url.includes('/evidence')) {
        return body.get('file').name === 'bad.pdf'
          ? Promise.reject(new Error('network'))
          : Promise.resolve({ data: {} })
      }
      return Promise.resolve({ data: {} })
    })
    render(<FamilyPriorLearningPage />)

    await stage(file('good.pdf'), file('bad.pdf'))
    await userEvent.click(screen.getByRole('button', { name: /send 2 documents/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('bad.pdf')))
    // The rest still went for review.
    expect(api.post.mock.calls.some(([url]) => url.includes('/submit'))).toBe(true)
  })
})

describe('what the parent sees afterwards', () => {
  const SENT = {
    id: 'rec-1', title: 'Riverside Co-op paperwork', status: 'submitted',
    student_user_id: 'kid-1', awarded_credits: {},
    evidence: [{
      id: 'e1', evidence_type: 'document', url: 'https://x/t.pdf',
      title: 'transcript.pdf', file_name: 'transcript.pdf', content: '9th grade algebra',
    }],
  }

  it('shows each document with the note that was written for it', async () => {
    mockPage({ records: [SENT] })
    render(<FamilyPriorLearningPage />)

    expect(await screen.findByRole('link', { name: 'transcript.pdf' }))
      .toHaveAttribute('href', 'https://x/t.pdf')
    expect(screen.getByText('9th grade algebra')).toBeInTheDocument()
  })

  it('reports the credit that was awarded', async () => {
    mockPage({ records: [{ ...SENT, status: 'accepted', awarded_credits: { math: 1 } }] })
    render(<FamilyPriorLearningPage />)

    expect(await screen.findByText(/credit awarded: 1 math/i)).toBeInTheDocument()
  })

  it('says so plainly when something was accepted without credit', async () => {
    mockPage({ records: [{ ...SENT, status: 'accepted' }] })
    render(<FamilyPriorLearningPage />)

    expect(await screen.findByText(/no credit awarded/i)).toBeInTheDocument()
  })

  it('offers no way to pull back something the school is already reading', async () => {
    mockPage({ records: [{ ...SENT, status: 'under_review' }] })
    render(<FamilyPriorLearningPage />)

    await screen.findByText('Riverside Co-op paperwork')
    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument()
  })
})

describe('the school hub card is opt-in', () => {
  const guardianOrg = (extra) => ({ is_guardian: true, post_registration_flow: 'goals', ...extra })
  const names = (org) => cardsFor(org).map((c) => c.name)

  describe('at Optio Academy, prior learning is the only thing on the page', () => {
    const academy = (extra) => guardianOrg({ organization_id: OPTIO_ACADEMY_ORG_ID, ...extra })

    it('carries the prior learning card and nothing else', () => {
      expect(names(academy({ prior_learning_enabled: true }))).toEqual(['Prior Learning'])
    })

    it('drops the cards this school does not run — the reason the page was pulled', () => {
      const cards = names(academy({ prior_learning_enabled: true }))
      for (const gone of ['Calendar', 'Resources', 'Directory', 'Billing',
        'Absences', 'Portal', 'Requests', 'Goal Setting', 'Schedule']) {
        expect(cards).not.toContain(gone)
      }
    })

    it('is an empty page rather than a wrong one if the flag is ever turned off', () => {
      expect(names(academy())).toEqual([])
    })

    it('shows a non-guardian nothing at all', () => {
      expect(names({
        organization_id: OPTIO_ACADEMY_ORG_ID, is_guardian: false, prior_learning_enabled: true,
      })).toEqual([])
    })
  })

  it('appears for a school that turned prior learning on', () => {
    expect(names(guardianOrg({ prior_learning_enabled: true }))).toContain('Prior Learning')
  })

  it('is absent for every school that did not', () => {
    expect(names(guardianOrg())).not.toContain('Prior Learning')
    expect(names(guardianOrg({ prior_learning_enabled: false }))).not.toContain('Prior Learning')
  })

  it('never shows to a non-guardian member of the school', () => {
    const staff = { is_guardian: false, prior_learning_enabled: true, post_registration_flow: 'goals' }
    expect(names(staff)).not.toContain('Prior Learning')
  })
})
