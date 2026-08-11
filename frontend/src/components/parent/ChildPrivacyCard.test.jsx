import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), delete: vi.fn() }
}))

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('@heroicons/react/24/outline', () => ({
  GlobeAltIcon: (props) => <svg data-testid="globe-icon" {...props} />,
  LockClosedIcon: (props) => <svg data-testid="lock-icon" {...props} />,
  LinkIcon: (props) => <svg data-testid="link-icon" {...props} />
}))

import api from '../../services/api'
import ChildPrivacyCard from './ChildPrivacyCard'

const mountWith = (status, shares = []) => {
  api.get.mockImplementation((url) => {
    if (url.includes('visibility-status')) return Promise.resolve({ data: { data: status } })
    if (url.includes('transcript-shares')) return Promise.resolve({ data: { data: { shares } } })
    return Promise.resolve({ data: {} })
  })
  api.put.mockResolvedValue({ data: { data: {} } })
  api.delete.mockResolvedValue({ data: { data: {} } })
  return render(<ChildPrivacyCard studentId="s1" studentName="Robin" />)
}

describe('ChildPrivacyCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('tells a parent when their child\'s work is public', async () => {
    mountWith({ is_public: true })
    expect(await screen.findByText(/Anyone with the link/i)).toBeInTheDocument()
  })

  it('shows a compact private strip when nothing needs attention', async () => {
    // Private + readable + no pending request: the card must not dominate the
    // dashboard, so it collapses to a one-line status strip.
    mountWith({ is_public: false })
    expect(await screen.findByText(/Robin.s portfolio: Private/i)).toBeInTheDocument()
    expect(screen.queryByText(/Only you and the people/i)).not.toBeInTheDocument()
  })

  it('expands the strip to the full controls on Manage', async () => {
    mountWith({ is_public: false })
    await userEvent.click(await screen.findByRole('button', { name: /manage/i }))
    expect(await screen.findByText(/Only you and the people/i)).toBeInTheDocument()
  })

  it('counts active transcript links on the compact strip', async () => {
    mountWith({ is_public: false }, [
      { id: 'g1', label: 'State University', is_active: true, view_count: 3 },
      { id: 'g2', label: 'Old link', is_active: false, view_count: 0 }
    ])
    expect(await screen.findByText(/1 transcript link shared/i)).toBeInTheDocument()
  })

  it('shows the public link when the portfolio is public', async () => {
    mountWith({ is_public: true, portfolio_slug: 'robin-r' })
    const input = await screen.findByLabelText(/public portfolio link/i)
    expect(input.value).toMatch(/\/portfolio\/robin-r$/)
    expect(screen.getByRole('link', { name: /view/i })).toHaveAttribute('href', '/portfolio/robin-r')
  })

  it('lets a parent make a public portfolio private in one click', async () => {
    // The gap this closes: a parent previously had no supported way to
    // un-publish their own child's work.
    mountWith({ is_public: true })
    const button = await screen.findByRole('button', { name: /make private/i })
    await userEvent.click(button)

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/api/portfolio/user/s1/privacy',
        expect.objectContaining({ is_public: false })
      )
    })
  })

  it('lets a parent publish on their child\'s behalf', async () => {
    mountWith({ is_public: false })
    await userEvent.click(await screen.findByRole('button', { name: /manage/i }))
    await userEvent.click(await screen.findByRole('button', { name: /make public/i }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/api/portfolio/user/s1/privacy',
        expect.objectContaining({ is_public: true, consent_acknowledged: true })
      )
    })
  })

  it('warns rather than claiming privacy when the state could not be read', async () => {
    // Guessing "private" here is exactly what misled parents before.
    mountWith({ is_public: false, unknown: true })
    expect(await screen.findByText(/couldn.t load the current setting/i)).toBeInTheDocument()
  })

  it('surfaces a pending request from the child', async () => {
    mountWith({ is_public: false, pending_parent_approval: true })
    expect(await screen.findByText(/waiting\s+on your decision/i)).toBeInTheDocument()
  })

  it('lists transcript links and revokes one', async () => {
    mountWith({ is_public: false }, [
      { id: 'g1', label: 'State University', is_active: true, view_count: 3 }
    ])

    await userEvent.click(await screen.findByRole('button', { name: /manage/i }))
    expect(await screen.findByText('State University')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /revoke/i }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith(
        '/api/portfolio/user/s1/transcript-shares/g1'
      )
    })
  })

  it('offers no revoke control for an already-inactive link', async () => {
    mountWith({ is_public: false }, [
      { id: 'g1', label: 'Old link', is_active: false, view_count: 0 }
    ])

    await userEvent.click(await screen.findByRole('button', { name: /manage/i }))
    expect(await screen.findByText('Old link')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument()
  })
})
