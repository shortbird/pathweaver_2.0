import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

import PoeShowcasePage from './PoeShowcasePage'

const SHOWCASE = {
  success: true,
  generated_at: '2026-09-02T00:00:00Z',
  totals: {
    cohorts: 1, participants: 2, participants_with_evidence: 1, credits_awarded: 1,
    days_documented: 1, reflections: 1, words: 4, photos: 1, videos: 0, documents: 0,
  },
  cohorts: [{
    slug: 'poe-4-2026',
    display_name: 'Provo, UT',
    start_date: '2026-07-20',
    end_date: '2026-07-25',
    participants: [{
      name: 'Aleena M.',
      credit_awarded: true,
      days: [{
        title: 'POE Day 1', day: 1, completed_at: '2026-07-23T20:30:17Z',
        blocks: [
          { type: 'text', text: 'I toured the organ.' },
          { type: 'image', items: [{ url: 'https://cdn.test/a.jpg', title: 'a.jpg', caption: 'The console' }] },
        ],
      }],
    }],
  }],
}

const renderPage = (search = '?key=abc') => render(
  <HelmetProvider>
    <MemoryRouter initialEntries={[`/poe/showcase${search}`]}>
      <PoeShowcasePage />
    </MemoryRouter>
  </HelmetProvider>
)

beforeEach(() => {
  api.get.mockReset()
})

describe('PoeShowcasePage', () => {
  it('passes the link key through to the showcase endpoint', async () => {
    api.get.mockResolvedValue({ data: SHOWCASE })
    renderPage('?key=s3cret')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/api/public/poe/showcase', { params: { key: 's3cret' } }
    ))
  })

  it('renders each camp, camper and evidence block', async () => {
    api.get.mockResolvedValue({ data: SHOWCASE })
    renderPage()

    expect(await screen.findByText('Provo, UT')).toBeInTheDocument()
    expect(screen.getByText('Aleena M.')).toBeInTheDocument()
    expect(screen.getByText('POE Day 1')).toBeInTheDocument()
    expect(screen.getByText('I toured the organ.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'The console' })).toHaveAttribute('src', 'https://cdn.test/a.jpg')
    expect(screen.getByText('0.5 fine arts credit awarded')).toBeInTheDocument()
  })

  // The stat row is the first thing POE leadership reads, so a mislabeled or
  // missing number is the most expensive kind of bug on this page.
  it('summarizes the pilot in the stat row', async () => {
    api.get.mockResolvedValue({ data: SHOWCASE })
    renderPage()

    const words = await screen.findByText('Words written')
    expect(words.previousSibling).toHaveTextContent('4')
    expect(screen.getByText('Credits awarded').previousSibling).toHaveTextContent('1')
  })

  it('explains a bad or missing key without leaking whether the page exists', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } })
    renderPage('')

    expect(await screen.findByText(/isn't available/i)).toBeInTheDocument()
    expect(screen.getByText(/ask optio for a current link/i)).toBeInTheDocument()
  })
})
