import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Alert } from './Alert'
import { StarIcon } from '@heroicons/react/24/outline'

describe('Alert Component', () => {
  describe('Basic Rendering', () => {
    it('renders alert with default variant (info)', () => {
      render(<Alert>This is an alert message</Alert>)
      expect(screen.getByText('This is an alert message')).toBeInTheDocument()
    })

    it('renders alert with title', () => {
      render(
        <Alert title="Important Notice">
          Please read this carefully
        </Alert>
      )
      expect(screen.getByText('Important Notice')).toBeInTheDocument()
      expect(screen.getByText('Please read this carefully')).toBeInTheDocument()
    })

    it('renders alert without title', () => {
      render(<Alert>Message only</Alert>)
      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })
  })

  describe('Variant Styles', () => {
    it('renders info variant correctly', () => {
      const { container } = render(<Alert variant="info">Info message</Alert>)
      const alertDiv = container.firstChild
      expect(alertDiv).toHaveClass('bg-blue-50', 'border-blue-200')
    })

    it('renders success variant correctly', () => {
      const { container } = render(<Alert variant="success">Success message</Alert>)
      const alertDiv = container.firstChild
      expect(alertDiv).toHaveClass('bg-green-50', 'border-green-200')
    })

    it('renders warning variant correctly', () => {
      const { container } = render(<Alert variant="warning">Warning message</Alert>)
      const alertDiv = container.firstChild
      expect(alertDiv).toHaveClass('bg-yellow-50', 'border-yellow-200')
    })

    it('renders error variant correctly', () => {
      const { container } = render(<Alert variant="error">Error message</Alert>)
      const alertDiv = container.firstChild
      expect(alertDiv).toHaveClass('bg-red-50', 'border-red-200')
    })

    it('renders purple variant correctly', () => {
      const { container } = render(<Alert variant="purple">Purple message</Alert>)
      const alertDiv = container.firstChild
      expect(alertDiv).toHaveClass('bg-purple-50', 'border-purple-200')
    })

    it('falls back to info variant for invalid variant', () => {
      const { container } = render(<Alert variant="invalid">Fallback message</Alert>)
      const alertDiv = container.firstChild
      expect(alertDiv).toHaveClass('bg-blue-50', 'border-blue-200')
    })
  })

  describe('Icon Handling', () => {
    it('shows icon by default', () => {
      const { container } = render(<Alert variant="success">With icon</Alert>)
      // Check for SVG element (icon)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('hides icon when showIcon is false', () => {
      const { container } = render(
        <Alert variant="success" showIcon={false}>
          Without icon
        </Alert>
      )
      const svg = container.querySelector('svg')
      expect(svg).not.toBeInTheDocument()
    })

    it('renders custom icon when provided', () => {
      const { container } = render(
        <Alert icon={<StarIcon data-testid="custom-icon" />}>
          Custom icon alert
        </Alert>
      )
      expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
    })

    it('renders default variant icon when custom icon not provided', () => {
      const { container } = render(<Alert variant="error">Default icon</Alert>)
      // XCircle icon should be rendered for error variant
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveClass('text-red-600')
    })
  })

  describe('Custom Styling', () => {
    it('applies custom className', () => {
      const { container } = render(
        <Alert className="mt-4 mx-auto">
          Custom class alert
        </Alert>
      )
      const alertDiv = container.firstChild
      expect(alertDiv).toHaveClass('mt-4', 'mx-auto')
    })

    it('preserves default classes when adding custom className', () => {
      const { container } = render(
        <Alert variant="success" className="custom-class">
          Alert with custom class
        </Alert>
      )
      const alertDiv = container.firstChild
      expect(alertDiv).toHaveClass('bg-green-50', 'border-green-200', 'custom-class')
    })
  })

  describe('Content Rendering', () => {
    it('renders simple text content', () => {
      render(<Alert>Simple text</Alert>)
      expect(screen.getByText('Simple text')).toBeInTheDocument()
    })

    it('renders rich HTML content', () => {
      render(
        <Alert>
          <strong>Bold text</strong> and <em>italic text</em>
        </Alert>
      )
      expect(screen.getByText('Bold text')).toBeInTheDocument()
      expect(screen.getByText('italic text')).toBeInTheDocument()
    })

    it('renders nested components', () => {
      render(
        <Alert>
          <div data-testid="nested-div">Nested content</div>
        </Alert>
      )
      expect(screen.getByTestId('nested-div')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('title renders as heading', () => {
      render(<Alert title="Accessible Title">Content</Alert>)
      const heading = screen.getByRole('heading', { name: 'Accessible Title' })
      expect(heading).toBeInTheDocument()
    })

    it('has proper structure for screen readers', () => {
      const { container } = render(
        <Alert title="Warning" variant="warning">
          This is important
        </Alert>
      )

      // Check structure: container > flex wrapper > icon + content wrapper
      const flexWrapper = container.querySelector('.flex.gap-3')
      expect(flexWrapper).toBeInTheDocument()

      // Content should be in a flex-1 div
      const contentWrapper = container.querySelector('.flex-1')
      expect(contentWrapper).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('renders when children is empty string', () => {
      const { container } = render(<Alert>{''}</Alert>)
      expect(container.firstChild).toBeInTheDocument()
    })

    it('renders when children is null', () => {
      const { container } = render(<Alert>{null}</Alert>)
      expect(container.firstChild).toBeInTheDocument()
    })

    it('renders when title is empty string', () => {
      render(<Alert title="">Message</Alert>)
      // Empty title should not render heading
      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })

    it('handles multiple children', () => {
      render(
        <Alert>
          <p>First paragraph</p>
          <p>Second paragraph</p>
        </Alert>
      )
      expect(screen.getByText('First paragraph')).toBeInTheDocument()
      expect(screen.getByText('Second paragraph')).toBeInTheDocument()
    })
  })
})
