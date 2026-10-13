import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PriorLearningCard from './PriorLearningCard'

const ENTRY = {
  id: 'r1', title: 'Junior year at Cava', provider: 'Cava Academy',
  started_on: '2024-08-20', ended_on: '2025-05-30',
  awarded_credits: { math: 1, social_studies: 0.5 }, total_credits: 1.5,
  evidence: [
    { id: 'e1', evidence_type: 'document', url: 'https://x/t.pdf', title: 'Transcript' },
    { id: 'e2', evidence_type: 'image', url: 'https://x/p.jpg', title: 'Science fair' },
  ],
}

describe('a prior learning card in the portfolio', () => {
  it('shows the credit and the XP it is worth', () => {
    render(<PriorLearningCard entry={ENTRY} />)
    expect(screen.getByText('Junior year at Cava')).toBeInTheDocument()
    expect(screen.getByText(/1\.5 credits/)).toBeInTheDocument()
    expect(screen.getByText('2,000 XP')).toBeInTheDocument()
  })

  it('shows every document it was given', () => {
    render(<PriorLearningCard entry={ENTRY} />)
    expect(screen.getByRole('link', { name: /Transcript/ })).toHaveAttribute('href', 'https://x/t.pdf')
    expect(screen.getByAltText('Science fair')).toBeInTheDocument()
  })

  it('still renders with no documents left public', () => {
    render(<PriorLearningCard entry={{ ...ENTRY, evidence: [] }} />)
    expect(screen.getByText('Junior year at Cava')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
