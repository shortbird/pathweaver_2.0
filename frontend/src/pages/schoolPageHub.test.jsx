import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The school hub.
 *
 * /school used to be two tabs of announcements while eight more school surfaces
 * sat loose in the sidebar — a parent at iCreate saw fourteen nav items, eight
 * of them the same school. Those eight are now cards on the school's own page.
 *
 * Two things this has to get right:
 *
 * 1. Which cards a given person gets. Calendar, Resources and Directory are the
 *    school's own content and belong to everyone in it. Billing, Absences,
 *    Portal, Requests and the Schedule Builder act on a FAMILY, and a student is
 *    a member of the school without being a guardian in it. Erring permissive
 *    here puts a Billing tile in front of a fourteen-year-old.
 *
 * 2. That the announcements archive did not move behind a click. It is the
 *    most-read thing on the page; the cards go above it, not in front of it.
 */

let orgState = { school: { id: 'org-1', name: 'iCreate', homepage: true }, organization: null, loading: false }
vi.mock('../contexts/OrganizationContext', () => ({
  useOrganization: () => orgState,
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, effectiveRole: 'student' }),
}))

const ANNOUNCEMENT = {
  id: 'a1', title: 'Picture day is Thursday', content: 'Wear something you like.',
  created_at: '2026-08-01T10:00:00Z',
}

let schoolContext = { success: true, orgs: [], is_guardian: false }
let archive = { success: true, announcements: [ANNOUNCEMENT], total: 1 }
let communityFeed = { success: true, feed: null }

const defaultGet = (url) => {
  if (url.startsWith('/api/sis/school/context')) return Promise.resolve({ data: schoolContext })
  if (url.startsWith('/api/announcements/archive')) return Promise.resolve({ data: archive })
  if (url.startsWith('/api/sis/community/feed')) return Promise.resolve({ data: communityFeed })
  return Promise.resolve({ data: {} })
}
const get = vi.fn(defaultGet)
vi.mock('../services/api', () => ({ default: { get: (...a) => get(...a) } }))

import SchoolPage from './SchoolPage'

const GUARDIAN_ORG = {
  organization_id: 'org-1', organization_name: 'iCreate',
  is_guardian: true, post_registration_flow: 'schedule',
}
const MEMBER_ORG = { ...GUARDIAN_ORG, is_guardian: false }

const renderPage = () => render(<MemoryRouter><SchoolPage /></MemoryRouter>)

const cardGrid = async () => {
  renderPage()
  return screen.findByRole('navigation', { name: /school/i })
}

const cardNames = async () => {
  const grid = await cardGrid()
  return within(grid).getAllByRole('heading').map((h) => h.textContent.trim())
}

const expandMessages = async () => {
  const btn = await screen.findByRole('button', { name: /Messages/i })
  fireEvent.click(btn)
  return screen.findByText('Picture day is Thursday')
}

beforeEach(() => {
  vi.clearAllMocks()
  get.mockImplementation(defaultGet)  // one test swaps it out for a failing call
  orgState = { school: { id: 'org-1', name: 'iCreate', homepage: true }, organization: null, loading: false }
  schoolContext = { success: true, orgs: [], is_guardian: false }
  archive = { success: true, announcements: [ANNOUNCEMENT], total: 1 }
  communityFeed = { success: true, feed: null }
})

describe('what a guardian gets', () => {
  beforeEach(() => {
    schoolContext = { success: true, orgs: [GUARDIAN_ORG], is_guardian: true }
  })

  it('offers every school surface as a card', async () => {
    expect(await cardNames()).toEqual(expect.arrayContaining([
      'Schedule Builder', 'Billing', 'Absences', 'Calendar',
      'Resources', 'Directory', 'Portal', 'Requests',
    ]))
  })

  it('points each card at the page that already served it', async () => {
    const grid = await cardGrid()
    const href = (name) =>
      within(grid).getByRole('heading', { name }).closest('a').getAttribute('href')
    expect(href('Billing')).toBe('/family/billing')
    expect(href('Absences')).toBe('/absences')
    expect(href('Calendar')).toBe('/school-calendar')
    expect(href('Resources')).toBe('/resources')
    expect(href('Directory')).toBe('/family-directory')
    expect(href('Portal')).toBe('/family/portal')
    expect(href('Requests')).toBe('/family/forms')
    expect(href('Schedule Builder')).toBe('/schedule-builder')
  })

  it('offers Goal Setting instead where the school runs goals', async () => {
    schoolContext = {
      success: true, is_guardian: true,
      orgs: [{ ...GUARDIAN_ORG, post_registration_flow: 'goals' }],
    }
    const names = await cardNames()
    expect(names).toContain('Goal Setting')
    expect(names).not.toContain('Schedule Builder')
  })
})

describe('what a student or teacher gets', () => {
  beforeEach(() => {
    schoolContext = { success: true, orgs: [MEMBER_ORG], is_guardian: false }
  })

  it('offers the school-wide surfaces', async () => {
    expect(await cardNames()).toEqual(expect.arrayContaining([
      'Calendar', 'Resources', 'Directory',
    ]))
  })

  it('never offers a family surface to someone who guards nobody', async () => {
    const names = await cardNames()
    for (const familyOnly of ['Billing', 'Absences', 'Portal', 'Requests',
                              'Schedule Builder', 'Goal Setting']) {
      expect(names).not.toContain(familyOnly)
    }
  })
})

describe('a school that is not on the SIS', () => {
  it('is still just its announcements', async () => {
    // Hearthwood, Treehouse, Gryffin: a school page with nothing behind it.
    // The endpoint returns no orgs for them, which is the signal for no cards.
    schoolContext = { success: true, orgs: [], is_guardian: false }
    renderPage()
    expect(await expandMessages()).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: /school/i })).not.toBeInTheDocument()
  })

  it('does not break the page when the context call fails', async () => {
    get.mockImplementation((url) => {
      if (url.startsWith('/api/sis/school/context')) return Promise.reject(new Error('down'))
      if (url.startsWith('/api/announcements/archive')) return Promise.resolve({ data: archive })
      return Promise.resolve({ data: { success: true, feed: null } })
    })
    renderPage()
    expect(await expandMessages()).toBeInTheDocument()
  })
})

describe('the school logo', () => {
  it('crowns the page when the school has one', async () => {
    schoolContext = {
      success: true, is_guardian: true,
      orgs: [{ ...GUARDIAN_ORG, logo_url: 'data:image/png;base64,logo' }],
    }
    const { container } = renderPage()
    await expandMessages()
    expect(container.querySelector('img[src="data:image/png;base64,logo"]')).toBeTruthy()
  })

  it('falls back to a neutral tile, never a broken image, without one', async () => {
    schoolContext = { success: true, orgs: [GUARDIAN_ORG], is_guardian: true }
    const { container } = renderPage()
    await expandMessages()
    expect(container.querySelector('header img')).toBeNull()
  })

  it('shows the configured word under the logo (Optio Academy lockup)', async () => {
    schoolContext = {
      success: true, is_guardian: true,
      orgs: [{ ...GUARDIAN_ORG, logo_url: 'data:image/png;base64,logo', logo_subtitle: 'academy' }],
    }
    renderPage()
    await expandMessages()
    expect(screen.getByText('academy')).toBeInTheDocument()
  })

  it('shows no subtitle when none is configured', async () => {
    schoolContext = {
      success: true, is_guardian: true,
      orgs: [{ ...GUARDIAN_ORG, logo_url: 'data:image/png;base64,logo' }],
    }
    renderPage()
    await expandMessages()
    expect(screen.queryByText('academy')).not.toBeInTheDocument()
  })
})

describe('the announcements archive', () => {
  it('is still on the page itself, not behind a card', async () => {
    schoolContext = { success: true, orgs: [GUARDIAN_ORG], is_guardian: true }
    renderPage()
    expect(await expandMessages()).toBeInTheDocument()
  })

  it('is not one of the cards', async () => {
    schoolContext = { success: true, orgs: [GUARDIAN_ORG], is_guardian: true }
    expect(await cardNames()).not.toContain('Announcements')
  })
})

describe('collapsible feed sections', () => {
  beforeEach(() => {
    archive = { success: true, announcements: [], total: 0 }
  })

  it('starts sections closed by default', async () => {
    communityFeed = {
      success: true,
      feed: {
        events: [{ id: 'e1', title: 'Science Fair', start_at: '2026-09-01T10:00:00Z' }],
        announcements: [], lost_found: [], recognition: [], carpool: [],
      },
    }
    renderPage()
    const sectionBtn = await screen.findByRole('button', { name: /Upcoming events/i })
    expect(sectionBtn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Science Fair')).not.toBeInTheDocument()
  })

  it('expands section when dropdown header is clicked', async () => {
    communityFeed = {
      success: true,
      feed: {
        events: [{ id: 'e1', title: 'Science Fair', start_at: '2026-09-01T10:00:00Z' }],
        announcements: [], lost_found: [], recognition: [], carpool: [],
      },
    }
    renderPage()
    const sectionBtn = await screen.findByRole('button', { name: /Upcoming events/i })
    fireEvent.click(sectionBtn)
    expect(sectionBtn).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('Science Fair')).toBeInTheDocument()
  })

  it('includes a link to the full calendar in the events section', async () => {
    communityFeed = {
      success: true,
      feed: {
        events: [{ id: 'e1', title: 'Science Fair', start_at: '2026-09-01T10:00:00Z' }],
        announcements: [], lost_found: [], recognition: [], carpool: [],
      },
    }
    renderPage()
    const calLinks = await screen.findAllByRole('link', { name: /calendar/i })
    expect(calLinks.some((a) => a.getAttribute('href') === '/school-calendar')).toBe(true)
  })
})
