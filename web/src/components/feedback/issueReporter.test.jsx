import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import IssueReporter from './IssueReporter'
import { Modal } from '../ui/Modal'

/**
 * The staff issue reporter, which replaced the Perch widget on 2026-09-14.
 *
 * The eligibility cases carried over from perchReporter.test.jsx: teachers
 * and campus coordinators are the audience that got lost twice already (the
 * beta FAB was org-admin-only at first, and so was the Perch widget), so
 * they are pinned here. Students never see the button.
 */
let authState = { user: null }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))

let orgState = { organization: null }
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))

const { api } = vi.hoisted(() => ({ api: { post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// The reporter files through react-query (hooks/api is the rule for new
// fetching), so the provider App.jsx supplies at the root is supplied here.
const render = (ui) => rtlRender(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    {ui}
  </QueryClientProvider>,
)

const button = () => screen.queryByRole('button', { name: 'Report an issue' })

beforeEach(() => {
  vi.clearAllMocks()
  authState = { user: null }
  orgState = { organization: null }
})

describe('IssueReporter', () => {
  it('shows for teachers, not just admins', () => {
    // The org_managed + org_role shape is how iCreate teachers arrive.
    authState = { user: { role: 'org_managed', org_role: 'advisor', email: 'teach@school.org' } }
    orgState = { organization: { slug: 'icreate', name: 'iCreate' } }
    render(<IssueReporter />)
    expect(button()).toBeTruthy()
  })

  it('shows for campus coordinators', () => {
    authState = { user: { role: 'org_managed', org_role: 'campus_coordinator' } }
    render(<IssueReporter />)
    expect(button()).toBeTruthy()
  })

  it('shows for staff with no org', () => {
    authState = { user: { role: 'superadmin' } }
    render(<IssueReporter />)
    expect(button()).toBeTruthy()
  })

  it('never shows for students or parents', () => {
    authState = { user: { role: 'student' } }
    render(<IssueReporter />)
    expect(button()).toBeNull()
    authState = { user: { role: 'parent' } }
    render(<IssueReporter />)
    expect(button()).toBeNull()
  })

  it('files a ticket into /api/bug-reports with the type, the org and the page', async () => {
    authState = { user: { role: 'org_managed', org_role: 'advisor', email: 'teach@school.org' } }
    orgState = { organization: { slug: 'icreate', name: 'iCreate' } }
    api.post.mockResolvedValue({ data: { success: true, report_id: 'r1' } })
    render(<IssueReporter />)

    fireEvent.click(button())
    fireEvent.click(screen.getByRole('button', { name: 'Suggest an improvement' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Sort classes by day' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'The list is alphabetical.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/bug-reports')
    expect(body.title).toBe('Sort classes by day')
    expect(body.message).toBe('The list is alphabetical.')
    expect(body.type).toBe('feature')
    expect(body.source).toBe('web')
    expect(body.current_route).toBe(window.location.pathname + window.location.search)
    expect(body.extra.organization_slug).toBe('icreate')
    // The panel closes on success.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('refuses an empty description without calling the API', () => {
    authState = { user: { role: 'superadmin' } }
    render(<IssueReporter />)
    fireEvent.click(button())
    fireEvent.click(screen.getByRole('button', { name: 'Something is broken' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(api.post).not.toHaveBeenCalled()
  })
  // iCreate, 2026-09-22: "I can't send feedback when the message popup is
  // open." The modal's focus trap pulled focus straight back out of the
  // reporter's textarea, so nothing could be typed and Send refused an empty
  // message. The trap has to stand down while the panel is up.
  describe('inside an open modal', () => {
    it('lets a person type in the panel and send the report', async () => {
      authState = { user: { role: 'org_managed', org_role: 'org_admin' } }
      orgState = { organization: { slug: 'icreate', name: 'iCreate' } }
      api.post.mockResolvedValue({ data: { id: 'b1' } })

      render(
        <>
          <Modal isOpen onClose={() => {}} title="New message">
            <textarea aria-label="Message" defaultValue="" />
          </Modal>
          <IssueReporter />
        </>,
      )

      fireEvent.click(button())
      fireEvent.click(screen.getByRole('button', { name: 'Something is broken' }))
      const box = screen.getByPlaceholderText(/What happened/)
      // The actual failure: focus goes to the panel and the trap takes it
      // back, so every keystroke lands in the modal behind it.
      box.focus()
      expect(document.activeElement).toBe(box)

      fireEvent.change(box, { target: { value: 'The class list is in no order.' } })
      expect(box).toHaveValue('The class list is in no order.')

      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
      await waitFor(() => expect(api.post).toHaveBeenCalled())
      const [, body] = api.post.mock.calls[0]
      expect(body.message).toBe('The class list is in no order.')
    })
  })
})
