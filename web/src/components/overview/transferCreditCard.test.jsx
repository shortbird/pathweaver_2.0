/**
 * Previous schools in the portfolio.
 *
 * One card per school a student transferred credit from, showing how much XP
 * came in and which subjects it landed in.
 *
 * The property worth guarding: the card must NOT surface the transcript. That
 * document is an education record carrying the student's name and grades, and
 * it lives in a private bucket for staff. The portfolio is the surface a
 * student shares with anyone they like, so it carries the shape of what they
 * brought — this much XP, in these subjects — and not the record itself.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PortfolioSection from './PortfolioSection'

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => null }))

const CAVA = {
  id: 'tc-1',
  school_name: 'California Virtual Academy at Los Angeles',
  subject_xp: { math: 6000, science: 6000, cte: 4500, health: 1000 },
  total_xp: 17500,
  total_credits: 8.75,
  transcript_url: 'https://storage.example/signed/transcript.pdf',
  notes: 'Junior year',
}

const MIRA_COSTA = {
  id: 'tc-2',
  school_name: 'Mira Costa High School',
  subject_xp: { pe: 4000 },
  total_xp: 4000,
  total_credits: 2.0,
}

const renderPortfolio = (transferCredits) => render(
  <MemoryRouter>
    <PortfolioSection
      achievements={[]}
      transferCredits={transferCredits}
      student={{ id: 's1', first_name: 'Finn' }}
      isOwner
    />
  </MemoryRouter>
)

const cardFor = (schoolName) => within(screen.getByText(schoolName).closest('.rounded-xl'))

describe('a card per previous school', () => {
  it('gives each school its own entry', () => {
    renderPortfolio([CAVA, MIRA_COSTA])
    expect(screen.getByText('California Virtual Academy at Los Angeles')).toBeInTheDocument()
    expect(screen.getByText('Mira Costa High School')).toBeInTheDocument()
  })

  it('shows the XP that came in from that school', () => {
    renderPortfolio([CAVA])
    expect(cardFor(CAVA.school_name).getByText('+17,500 XP')).toBeInTheDocument()
  })

  it('lists the subjects the credit landed in, largest first', () => {
    renderPortfolio([CAVA])
    const card = cardFor(CAVA.school_name)
    const subjects = card.getAllByRole('listitem').map((li) => li.textContent)
    expect(subjects[0]).toContain('Mathematics')
    expect(subjects[0]).toContain('6,000 XP')
    expect(subjects[subjects.length - 1]).toContain('Health')
    expect(subjects).toHaveLength(4)
  })

  it('names subjects readably rather than by their database key', () => {
    renderPortfolio([CAVA])
    const card = cardFor(CAVA.school_name)
    expect(card.getByText('Career & Tech Ed')).toBeInTheDocument()
    expect(card.queryByText('cte')).not.toBeInTheDocument()
  })

  it('states the credits alongside the XP', () => {
    renderPortfolio([CAVA])
    expect(cardFor(CAVA.school_name).getByText('8.75 credits')).toBeInTheDocument()
  })
})

describe('the transcript stays out of the portfolio', () => {
  it('offers no link to the transcript document', () => {
    renderPortfolio([CAVA])
    const card = cardFor(CAVA.school_name)
    expect(card.queryByText(/View Transcript/i)).not.toBeInTheDocument()
    expect(card.queryByRole('link')).not.toBeInTheDocument()
  })

  it('does not put the signed URL anywhere in the markup', () => {
    const { container } = renderPortfolio([CAVA])
    expect(container.innerHTML).not.toContain('transcript.pdf')
  })
})

describe('edges', () => {
  it('renders nothing for a student who transferred no credit', () => {
    renderPortfolio(null)
    expect(screen.queryByText(/Credit transferred in/)).not.toBeInTheDocument()
  })

  it('accepts the legacy single-object shape', () => {
    renderPortfolio(CAVA)
    expect(screen.getByText('California Virtual Academy at Los Angeles')).toBeInTheDocument()
  })

  it('falls back to a generic name when the school was never recorded', () => {
    renderPortfolio([{ ...CAVA, school_name: null }])
    expect(screen.getByText('Previous School')).toBeInTheDocument()
  })

  it('skips a subject carrying no XP', () => {
    renderPortfolio([{ ...CAVA, subject_xp: { math: 6000, pe: 0 } }])
    expect(cardFor(CAVA.school_name).getAllByRole('listitem')).toHaveLength(1)
  })
})
