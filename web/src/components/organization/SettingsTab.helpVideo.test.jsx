import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsTab from './SettingsTab'

const helpVideoViews = vi.fn()
vi.mock('../../services/api', () => ({
  default: { put: vi.fn(), post: vi.fn(), get: vi.fn() },
  oeaAPI: { helpVideoViews: (...args) => helpVideoViews(...args) },
}))

vi.mock('./SchoolLoginLinkCard', () => ({ default: () => null }))

const orgData = (slug = 'hearthwood') => ({
  organization: { id: 'org-1', name: 'Hearthwood Academy', slug, feature_flags: {} },
})

const renderTab = (slug) =>
  render(<SettingsTab orgId="org-1" orgData={orgData(slug)} onUpdate={vi.fn()} />)

describe('SettingsTab getting-started video tracker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    helpVideoViews.mockResolvedValue({
      data: {
        help_video_url: 'https://www.youtube.com/watch?v=abc',
        parent_count: 3,
        opened_count: 1,
        parents: [
          { id: 'p2', name: 'Grace Hopper', email: 'grace@x.com', opened: false, open_count: 0 },
          { id: 'p3', name: 'Katherine Johnson', email: 'kj@x.com', opened: false, open_count: 0 },
          { id: 'p1', name: 'Ada Lovelace', email: 'ada@x.com', opened: true, open_count: 2,
            first_opened_at: '2026-08-20T00:00:00Z' },
        ],
      },
    })
  })

  it('shows how many parents have opened it, and says why that is not "watched"', async () => {
    renderTab()
    expect(await screen.findByText('1 of 3 parents have opened it')).toBeInTheDocument()
    expect(screen.getByText(/we can't tell how much of it they watched/)).toBeInTheDocument()
    expect(screen.getByText(/youtube\.com/)).toBeInTheDocument()
  })

  it('lists each parent behind "See who", unopened first', async () => {
    renderTab()
    await userEvent.click(await screen.findByText('See who'))

    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Grace Hopper')
    expect(rows[0]).toHaveTextContent('Not opened')
    expect(rows[2]).toHaveTextContent('Ada Lovelace')
    expect(rows[2]).toHaveTextContent(/Opened/)
  })

  it('stays quiet for orgs with no getting-started video', async () => {
    renderTab('treehouse')
    await waitFor(() => expect(helpVideoViews).not.toHaveBeenCalled())
    expect(screen.queryByText(/parents have opened it/)).not.toBeInTheDocument()
  })
})
