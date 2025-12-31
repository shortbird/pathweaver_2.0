import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PhilosophyGuide from '../PhilosophyGuide'

describe('PhilosophyGuide Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('renders philosophy guide content when open', () => {
      render(<PhilosophyGuide {...defaultProps} />)
      // Check for first slide title
      expect(screen.getByText(/Just-In-Time Teaching/i)).toBeInTheDocument()
    })

    it('renders slide subtitle', () => {
      render(<PhilosophyGuide {...defaultProps} />)
      expect(screen.getByText(/Learn Exactly When You Need It/i)).toBeInTheDocument()
    })

    it('does not render when isOpen is false', () => {
      render(<PhilosophyGuide isOpen={false} onClose={vi.fn()} />)
      expect(screen.queryByText(/Just-In-Time Teaching/i)).not.toBeInTheDocument()
    })
  })

  describe('Slide Navigation', () => {
    it('navigates to next slide when Next button is clicked', async () => {
      const user = userEvent.setup()
      render(<PhilosophyGuide {...defaultProps} />)

      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      // Second slide title
      expect(screen.getByText(/Zone of Proximal Development/i)).toBeInTheDocument()
    })

    it('navigates to previous slide when Previous button is clicked', async () => {
      const user = userEvent.setup()
      render(<PhilosophyGuide {...defaultProps} />)

      // Go to slide 2 first
      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      // Go back
      const prevButton = screen.getByRole('button', { name: /previous/i })
      await user.click(prevButton)

      expect(screen.getByText(/Just-In-Time Teaching/i)).toBeInTheDocument()
    })

    it('shows slide progress dots', () => {
      render(<PhilosophyGuide {...defaultProps} />)
      const dots = screen.getAllByRole('button', { name: /go to slide/i })
      expect(dots).toHaveLength(4) // 4 slides
    })
  })

  describe('Interactions', () => {
    it('closes when close button is clicked', async () => {
      const onClose = vi.fn()
      const user = userEvent.setup()
      render(<PhilosophyGuide isOpen={true} onClose={onClose} />)

      const closeButton = screen.getByRole('button', { name: /close philosophy guide/i })
      await user.click(closeButton)

      expect(onClose).toHaveBeenCalled()
    })

    it('closes when Skip Tutorial is clicked', async () => {
      const onClose = vi.fn()
      const user = userEvent.setup()
      render(<PhilosophyGuide isOpen={true} onClose={onClose} />)

      const skipButton = screen.getByRole('button', { name: /skip tutorial/i })
      await user.click(skipButton)

      expect(onClose).toHaveBeenCalled()
    })

    it('shows Get Started button on last slide', async () => {
      const user = userEvent.setup()
      render(<PhilosophyGuide {...defaultProps} />)

      // Navigate to last slide (4 slides, so click Next 3 times)
      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)
      await user.click(nextButton)
      await user.click(nextButton)

      expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has proper dialog role and aria-modal', () => {
      render(<PhilosophyGuide {...defaultProps} />)
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    })

    it('has labeled dialog title', () => {
      render(<PhilosophyGuide {...defaultProps} />)
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'philosophy-guide-title')
    })
  })
})
