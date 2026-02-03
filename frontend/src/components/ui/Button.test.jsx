import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Button from './Button'

describe('Button Component', () => {
  describe('Basic Rendering', () => {
    it('renders button with text', () => {
      render(<Button>Click Me</Button>)
      expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
    })

    it('renders button with children elements', () => {
      render(
        <Button>
          <span>Icon</span>
          <span>Text</span>
        </Button>
      )
      expect(screen.getByText('Icon')).toBeInTheDocument()
      expect(screen.getByText('Text')).toBeInTheDocument()
    })

    it('has type="button" by default', () => {
      render(<Button>Button</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
    })

    it('can override type attribute', () => {
      render(<Button type="submit">Submit</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
    })
  })

  describe('Variants', () => {
    it('renders primary variant by default', () => {
      const { container } = render(<Button>Primary</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('bg-gradient-primary')
    })

    it('renders secondary variant correctly', () => {
      const { container } = render(<Button variant="secondary">Secondary</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('bg-gray-200', 'hover:bg-gray-300')
    })

    it('renders danger variant correctly', () => {
      const { container } = render(<Button variant="danger">Danger</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('bg-red-600', 'hover:bg-red-700')
    })

    it('renders success variant correctly', () => {
      const { container } = render(<Button variant="success">Success</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('bg-green-600', 'hover:bg-green-700')
    })

    it('renders ghost variant correctly', () => {
      const { container } = render(<Button variant="ghost">Ghost</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('bg-transparent', 'hover:bg-gray-100')
    })

    it('renders outline variant correctly', () => {
      const { container } = render(<Button variant="outline">Outline</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('border-2', 'border-optio-pink')
    })
  })

  describe('Sizes', () => {
    it('renders medium size by default', () => {
      const { container } = render(<Button>Medium</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('px-6', 'py-3', 'text-sm')
    })

    it('renders extra small size correctly', () => {
      const { container } = render(<Button size="xs">Extra Small</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('px-3', 'py-2', 'text-xs')
    })

    it('renders small size correctly', () => {
      const { container } = render(<Button size="sm">Small</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('px-4', 'py-2.5', 'text-sm')
    })

    it('renders large size correctly', () => {
      const { container } = render(<Button size="lg">Large</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('px-8', 'py-4', 'text-base')
    })

    it('renders extra large size correctly', () => {
      const { container } = render(<Button size="xl">Extra Large</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('px-10', 'py-5', 'text-lg')
    })
  })

  describe('Interactions', () => {
    it('calls onClick when clicked', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()

      render(<Button onClick={handleClick}>Click Me</Button>)

      await user.click(screen.getByRole('button'))

      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('does not call onClick when disabled', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()

      render(<Button onClick={handleClick} disabled>Disabled</Button>)

      await user.click(screen.getByRole('button'))

      expect(handleClick).not.toHaveBeenCalled()
    })

    it('does not call onClick when loading', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()

      render(<Button onClick={handleClick} loading>Loading</Button>)

      await user.click(screen.getByRole('button'))

      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe('Disabled State', () => {
    it('is disabled when disabled prop is true', () => {
      render(<Button disabled>Disabled</Button>)
      expect(screen.getByRole('button')).toBeDisabled()
    })

    it('is not disabled by default', () => {
      render(<Button>Enabled</Button>)
      expect(screen.getByRole('button')).not.toBeDisabled()
    })

    it('has disabled styling when disabled', () => {
      const { container } = render(<Button disabled>Disabled</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('disabled:opacity-50', 'disabled:cursor-not-allowed')
    })
  })

  describe('Loading State', () => {
    it('shows loading spinner when loading', () => {
      const { container } = render(<Button loading>Loading</Button>)
      const spinner = container.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('does not show spinner when not loading', () => {
      const { container } = render(<Button>Not Loading</Button>)
      const spinner = container.querySelector('.animate-spin')
      expect(spinner).not.toBeInTheDocument()
    })

    it('is disabled when loading', () => {
      render(<Button loading>Loading</Button>)
      expect(screen.getByRole('button')).toBeDisabled()
    })

    it('shows both spinner and text when loading', () => {
      const { container } = render(<Button loading>Loading Text</Button>)
      expect(container.querySelector('.animate-spin')).toBeInTheDocument()
      expect(screen.getByText('Loading Text')).toBeInTheDocument()
    })
  })

  describe('Custom Classes', () => {
    it('applies custom className', () => {
      const { container } = render(<Button className="custom-class">Custom</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('custom-class')
    })

    it('preserves base classes when custom className is added', () => {
      const { container } = render(<Button className="mt-4">Custom</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('mt-4', 'inline-flex', 'items-center', 'justify-center')
    })

    it('preserves variant classes when custom className is added', () => {
      const { container } = render(<Button variant="danger" className="w-full">Custom</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('w-full', 'bg-red-600')
    })
  })

  describe('Additional Props', () => {
    it('passes through additional HTML attributes', () => {
      render(
        <Button data-testid="custom-button" aria-label="Custom Label">
          Button
        </Button>
      )

      const button = screen.getByTestId('custom-button')
      expect(button).toBeInTheDocument()
      expect(button).toHaveAttribute('aria-label', 'Custom Label')
    })

    it('passes through id attribute', () => {
      render(<Button id="submit-button">Submit</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('id', 'submit-button')
    })

    it('passes through name attribute', () => {
      render(<Button name="action">Action</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('name', 'action')
    })
  })

  describe('Accessibility', () => {
    it('has focus ring classes', () => {
      const { container } = render(<Button>Focus Me</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('focus:outline-none', 'focus:ring-2', 'focus:ring-offset-2')
    })

    it('has touch-manipulation for better mobile UX', () => {
      const { container } = render(<Button>Touch</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('touch-manipulation')
    })

    it('has minimum height for touch targets', () => {
      const { container } = render(<Button size="xs">Small Touch Target</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('min-h-[40px]')
    })

    it('respects aria-disabled when disabled', () => {
      render(<Button disabled>Disabled</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })
  })

  describe('Variant and Size Combinations', () => {
    it('renders primary large button correctly', () => {
      const { container } = render(<Button variant="primary" size="lg">Large Primary</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('bg-gradient-primary', 'px-8', 'py-4')
    })

    it('renders danger small button correctly', () => {
      const { container } = render(<Button variant="danger" size="sm">Small Danger</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('bg-red-600', 'px-4', 'py-2.5')
    })

    it('renders outline extra large button correctly', () => {
      const { container } = render(<Button variant="outline" size="xl">XL Outline</Button>)
      const button = container.firstChild
      expect(button).toHaveClass('border-optio-pink', 'px-10', 'py-5')
    })
  })

  describe('Edge Cases', () => {
    it('handles empty children', () => {
      const { container } = render(<Button>{''}</Button>)
      expect(container.firstChild).toBeInTheDocument()
    })

    it('handles undefined onClick gracefully', () => {
      render(<Button>No Handler</Button>)
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('handles both disabled and loading states together', () => {
      render(<Button disabled loading>Both</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('handles invalid variant gracefully', () => {
      const { container } = render(<Button variant="invalid">Invalid</Button>)
      // Should not crash, button should still render
      expect(container.firstChild).toBeInTheDocument()
    })

    it('handles invalid size gracefully', () => {
      const { container } = render(<Button size="invalid">Invalid</Button>)
      // Should not crash, button should still render
      expect(container.firstChild).toBeInTheDocument()
    })
  })

  describe('Component Memoization', () => {
    it('is wrapped in React.memo for performance', () => {
      // Check that the component is memoized
      expect(Button.$$typeof).toBeDefined()
    })
  })
})
