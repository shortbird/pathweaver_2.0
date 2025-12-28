import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PhilosophyGuide from '../PhilosophyGuide'

describe('PhilosophyGuide Component', () => {
  describe('Basic Rendering', () => {
    it('renders philosophy guide content', () => {
      render(<PhilosophyGuide />)
      expect(screen.getByText(/process is the goal/i)).toBeInTheDocument()
    })

    it('renders philosophy principles', () => {
      render(<PhilosophyGuide />)
      expect(screen.getByText(/present-focused/i)).toBeInTheDocument()
    })
  })

  describe('Interactions', () => {
    it('toggles expanded state on click', async () => {
      const user = userEvent.setup()
      render(<PhilosophyGuide />)

      const toggleButton = screen.getByRole('button')
      await user.click(toggleButton)

      expect(screen.getByText(/full philosophy/i)).toBeInTheDocument()
    })

    it('closes when close button is clicked', async () => {
      const user = userEvent.setup()
      render(<PhilosophyGuide />)

      await user.click(screen.getByRole('button'))
      const closeButton = screen.getByLabelText(/close/i)
      await user.click(closeButton)

      expect(screen.queryByText(/full philosophy/i)).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      render(<PhilosophyGuide />)
      expect(screen.getByLabelText(/philosophy guide/i)).toBeInTheDocument()
    })
  })
})
