/**
 * The transcript section is admin-only and must not fetch for anyone else.
 *
 * StudentOverviewSections renders this for students, parents and observers as
 * well as admins. Both endpoints it calls are @require_school_admin, so every
 * parent viewing their child fired a request that could only ever 403. The
 * catch swallowed it — nothing looked broken — while Sentry collected 30 events
 * from 23 parents (OPTIO-WEB-3).
 */

import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn() }
}))

const mockUseAuth = vi.fn()
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth()
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children }) => <a>{children}</a>
}))

import api from '../../services/api'
import TranscriptSection from './TranscriptSection'

const STUDENT = 'student-123'

const transcriptPayload = {
  data: {
    data: {
      student: { first_name: 'Ada', last_name: 'Lovelace' },
      earned_credits: {},
      class_credits: [],
      transfer_credits: [],
      planned_credits: [],
      overrides: {},
      totals: { total_completed: 3, planned_credits: 0 }
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

const renderFor = (user) => {
  mockUseAuth.mockReturnValue({ user })
  return render(<TranscriptSection studentId={STUDENT} />)
}

describe('viewers who cannot call the admin endpoints', () => {
  it('does not fetch for a parent', async () => {
    renderFor({ role: 'org_managed', org_role: 'parent', org_roles: ['parent'] })
    await waitFor(() => expect(api.get).not.toHaveBeenCalled())
  })

  it('does not fetch for a student', async () => {
    renderFor({ role: 'student' })
    await waitFor(() => expect(api.get).not.toHaveBeenCalled())
  })

  it('does not fetch for an observer', async () => {
    renderFor({ role: 'observer' })
    await waitFor(() => expect(api.get).not.toHaveBeenCalled())
  })

  it('does not fetch for an advisor, who is staff but not an org admin', async () => {
    renderFor({ role: 'org_managed', org_role: 'advisor', org_roles: ['advisor'] })
    await waitFor(() => expect(api.get).not.toHaveBeenCalled())
  })

  it('does not fetch for a campus coordinator', async () => {
    // require_school_admin admits superadmin/org_admin only — a coordinator
    // would get the same 403 a parent did.
    renderFor({ role: 'org_managed', org_role: 'campus_coordinator' })
    await waitFor(() => expect(api.get).not.toHaveBeenCalled())
  })

  it('does not fetch when there is no user yet', async () => {
    renderFor(null)
    await waitFor(() => expect(api.get).not.toHaveBeenCalled())
  })

  it('renders nothing for a parent', async () => {
    const { container } = renderFor({ role: 'org_managed', org_role: 'parent' })
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})

describe('admins still get the transcript', () => {
  it('fetches for a superadmin', async () => {
    api.get
      .mockResolvedValueOnce({ data: { data: { exists: true } } })
      .mockResolvedValueOnce(transcriptPayload)

    renderFor({ role: 'superadmin' })

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(`/api/admin/transcript/${STUDENT}/exists`)
    )
    expect(await screen.findByText('Official Transcript')).toBeInTheDocument()
  })

  it('fetches for an org admin', async () => {
    api.get.mockResolvedValue({ data: { data: { exists: false } } })
    renderFor({ role: 'org_managed', org_role: 'org_admin', org_roles: ['org_admin'] })
    await waitFor(() => expect(api.get).toHaveBeenCalled())
  })

  it('fetches for an org admin identified only by the is_org_admin flag', async () => {
    api.get.mockResolvedValue({ data: { data: { exists: false } } })
    renderFor({ role: 'org_managed', is_org_admin: true })
    await waitFor(() => expect(api.get).toHaveBeenCalled())
  })

  it('fetches for a parent who is also an org admin via org_roles', async () => {
    // The multi-role case: org_role says parent, the array says otherwise.
    api.get.mockResolvedValue({ data: { data: { exists: false } } })
    renderFor({
      role: 'org_managed',
      org_role: 'parent',
      org_roles: ['parent', 'org_admin']
    })
    await waitFor(() => expect(api.get).toHaveBeenCalled())
  })

  it('renders nothing when no transcript has been created', async () => {
    api.get.mockResolvedValue({ data: { data: { exists: false } } })
    const { container } = renderFor({ role: 'superadmin' })
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})

describe('only finished courses are on the transcript (ticket 9200a103, item 1)', () => {
  // Optio awards only an A, so a course goes on the transcript only when it is
  // finished. This summary is headed "Official Transcript" and used to list
  // in-progress planned credits with an "In Progress" chip and an "In
  // Progress" total. The admin endpoint still returns them for the editor.
  // A planned credit is never finished (Tanner, 2026-09-29), so none shows,
  // including a row saved as 'completed' before the form stopped offering it.
  it('ticket 9200a103: leaves every planned credit off, keeps finished credit', async () => {
    api.get
      .mockResolvedValueOnce({ data: { data: { exists: true } } })
      .mockResolvedValueOnce({
        data: {
          data: {
            ...transcriptPayload.data.data,
            earned_credits: { math: { display_name: 'Mathematics', credits: 1 } },
            planned_credits: [
              { school_subject: 'fine_arts', course_name: 'Ceramics I', credits: 0.5, status: 'in_progress' },
              { school_subject: 'science', course_name: 'Chemistry', credits: 1, status: 'dropped' },
              { school_subject: 'health', course_name: 'First Aid', credits: 0.5, status: 'completed' },
            ],
            totals: { total_completed: 1, planned_credits: 0.5, gpa: 4 },
          }
        }
      })

    renderFor({ role: 'superadmin' })

    expect(await screen.findByText('Mathematics')).toBeInTheDocument()
    expect(screen.queryByText('First Aid')).toBeNull()
    expect(screen.queryByText('Ceramics I')).toBeNull()
    expect(screen.queryByText('Chemistry')).toBeNull()
    expect(screen.queryByText('In Progress')).toBeNull()
    expect(screen.queryByText(/In Progress:/)).toBeNull()
    // Totals and GPA come from completed credit only.
    expect(screen.getByText('1.0')).toBeInTheDocument()
    expect(screen.getByText('4.00')).toBeInTheDocument()
  })
})
