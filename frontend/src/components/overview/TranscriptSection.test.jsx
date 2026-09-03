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
