import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import ForSchoolsPage from './ForSchoolsPage'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({})
}))

vi.mock('../../services/posthog', () => ({
  captureEvent: vi.fn()
}))

vi.mock('../../services/googleAnalytics', () => ({
  gaTrackEvent: vi.fn()
}))

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <ForSchoolsPage />
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe('ForSchoolsPage', () => {
  it('leads with the building blocks positioning', () => {
    renderPage()
    expect(screen.getByText('One Platform. Built Your Way.')).toBeInTheDocument()
    expect(screen.getByText('Take What You Need. Leave the Rest.')).toBeInTheDocument()
    expect(screen.getByText('Assembled Around Your Model')).toBeInTheDocument()
    expect(screen.getByText('Offer Your Students Accredited Diplomas')).toBeInTheDocument()
  })

  it('shows each example program as blocks switched on and off', () => {
    renderPage()
    // Three compositions, each showing both halves of the choice.
    expect(screen.getAllByText('Switched on')).toHaveLength(3)
    expect(screen.getAllByText('Switched off')).toHaveLength(3)
  })

  it('gives every building block an icon', () => {
    const { container } = renderPage()
    // Blocks render as icon + name + description; a missing icon name would
    // silently render nothing, so count the cards against their icons.
    const blockCards = container.querySelectorAll('.border-l-optio-purple\\/40')
    expect(blockCards.length).toBeGreaterThan(40)
    blockCards.forEach((card) => {
      expect(card.querySelector('svg')).not.toBeNull()
    })
  })
})
