import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PathwayCard from './PathwayCard'

const pathway = {
  key: 'traditional',
  name: 'Traditionally Aligned',
  tagline: 'Conventional high school structure',
  description: 'A structure that looks like a traditional high school.',
  best_for: 'Families who want a traditional structure',
  total_credits: 24,
  foundation_credits: 13,
  elective_credits: 11,
  requirements: [
    { key: 'language_arts', label: 'Language Arts', category: 'foundation', credits: 4 },
    { key: 'student_choice', label: 'Student Choice', category: 'elective', credits: 5 }
  ]
}

describe('PathwayCard', () => {
  it('renders name, tagline, credit split and requirements', () => {
    render(<PathwayCard pathway={pathway} selected={false} onSelect={vi.fn()} />)
    expect(screen.getByText('Traditionally Aligned')).toBeInTheDocument()
    expect(screen.getByText('Conventional high school structure')).toBeInTheDocument()
    expect(screen.getByText('Language Arts')).toBeInTheDocument()
    expect(screen.getByText('Student Choice')).toBeInTheDocument()
    // Credit pills
    expect(screen.getByText('13')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
  })

  it('calls onSelect with the pathway key when chosen', () => {
    const onSelect = vi.fn()
    render(<PathwayCard pathway={pathway} selected={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Choose this pathway'))
    expect(onSelect).toHaveBeenCalledWith('traditional')
  })

  it('shows the selected state', () => {
    render(<PathwayCard pathway={pathway} selected onSelect={vi.fn()} />)
    expect(screen.getByText('Selected pathway')).toBeInTheDocument()
  })

  it('shows a saving state on the selected card', () => {
    render(<PathwayCard pathway={pathway} selected saving onSelect={vi.fn()} />)
    expect(screen.getByText('Saving...')).toBeInTheDocument()
  })
})
