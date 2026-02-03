import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Card, CardHeader, CardBody, CardFooter, CardTitle } from './Card'

describe('Card Component', () => {
  describe('Basic Rendering', () => {
    it('renders card with children', () => {
      render(<Card>Card Content</Card>)
      expect(screen.getByText('Card Content')).toBeInTheDocument()
    })

    it('renders elevated variant by default', () => {
      const { container } = render(<Card>Content</Card>)
      const card = container.firstChild
      expect(card).toHaveClass('bg-white', 'rounded-xl', 'shadow-lg')
    })

    it('renders with medium padding by default', () => {
      const { container } = render(<Card>Content</Card>)
      const card = container.firstChild
      expect(card).toHaveClass('p-6')
    })
  })

  describe('Variants', () => {
    it('renders elevated variant correctly', () => {
      const { container } = render(<Card variant="elevated">Elevated</Card>)
      const card = container.firstChild
      expect(card).toHaveClass('bg-white', 'rounded-xl', 'shadow-lg', 'border-gray-200')
    })

    it('renders outlined variant correctly', () => {
      const { container } = render(<Card variant="outlined">Outlined</Card>)
      const card = container.firstChild
      expect(card).toHaveClass('bg-white', 'rounded-lg', 'shadow-sm', 'border-gray-200')
    })

    it('renders flat variant correctly', () => {
      const { container } = render(<Card variant="flat">Flat</Card>)
      const card = container.firstChild
      expect(card).toHaveClass('bg-white', 'rounded-lg', 'border-gray-200')
    })
  })

  describe('Padding', () => {
    it('renders no padding when padding is "none"', () => {
      const { container } = render(<Card padding="none">No Padding</Card>)
      const card = container.firstChild
      expect(card).not.toHaveClass('p-4', 'p-6', 'p-8')
    })

    it('renders small padding correctly', () => {
      const { container } = render(<Card padding="sm">Small Padding</Card>)
      const card = container.firstChild
      expect(card).toHaveClass('p-4')
    })

    it('renders medium padding correctly', () => {
      const { container } = render(<Card padding="md">Medium Padding</Card>)
      const card = container.firstChild
      expect(card).toHaveClass('p-6')
    })

    it('renders large padding correctly', () => {
      const { container } = render(<Card padding="lg">Large Padding</Card>)
      const card = container.firstChild
      expect(card).toHaveClass('p-8')
    })
  })

  describe('Interactivity', () => {
    it('calls onClick when card is clicked', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()

      render(<Card onClick={handleClick}>Clickable Card</Card>)

      await user.click(screen.getByText('Clickable Card'))

      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('has role="button" when onClick is provided', () => {
      const handleClick = vi.fn()
      const { container } = render(<Card onClick={handleClick}>Clickable</Card>)
      const card = container.firstChild
      expect(card).toHaveAttribute('role', 'button')
    })

    it('has tabIndex when onClick is provided', () => {
      const handleClick = vi.fn()
      const { container } = render(<Card onClick={handleClick}>Clickable</Card>)
      const card = container.firstChild
      expect(card).toHaveAttribute('tabIndex', '0')
    })

    it('does not have role="button" when onClick is not provided', () => {
      const { container } = render(<Card>Not Clickable</Card>)
      const card = container.firstChild
      expect(card).not.toHaveAttribute('role')
    })

    it('adds hover effect when onClick is provided', () => {
      const handleClick = vi.fn()
      const { container } = render(<Card onClick={handleClick}>Hover</Card>)
      const card = container.firstChild
      expect(card).toHaveClass('hover:shadow-xl', 'transition-shadow', 'cursor-pointer')
    })

    it('adds hover effect when hoverable is true', () => {
      const { container } = render(<Card hoverable>Hover</Card>)
      const card = container.firstChild
      expect(card).toHaveClass('hover:shadow-xl', 'transition-shadow', 'cursor-pointer')
    })

    it('does not add hover effect by default', () => {
      const { container } = render(<Card>No Hover</Card>)
      const card = container.firstChild
      expect(card).not.toHaveClass('hover:shadow-xl')
    })
  })

  describe('Custom Classes', () => {
    it('applies custom className', () => {
      const { container } = render(<Card className="custom-class">Custom</Card>)
      const card = container.firstChild
      expect(card).toHaveClass('custom-class')
    })

    it('preserves default classes when custom className is added', () => {
      const { container } = render(<Card className="mt-4">Custom</Card>)
      const card = container.firstChild
      expect(card).toHaveClass('mt-4', 'bg-white', 'rounded-xl')
    })
  })

  describe('Edge Cases', () => {
    it('handles empty children', () => {
      const { container } = render(<Card>{''}</Card>)
      expect(container.firstChild).toBeInTheDocument()
    })

    it('handles null children', () => {
      const { container } = render(<Card>{null}</Card>)
      expect(container.firstChild).toBeInTheDocument()
    })

    it('handles multiple children', () => {
      render(
        <Card>
          <p>First</p>
          <p>Second</p>
        </Card>
      )
      expect(screen.getByText('First')).toBeInTheDocument()
      expect(screen.getByText('Second')).toBeInTheDocument()
    })
  })
})

describe('CardHeader Component', () => {
  describe('Basic Rendering', () => {
    it('renders header with children', () => {
      render(<CardHeader>Header Content</CardHeader>)
      expect(screen.getByText('Header Content')).toBeInTheDocument()
    })

    it('renders without gradient by default', () => {
      const { container } = render(<CardHeader>Plain Header</CardHeader>)
      const header = container.firstChild
      expect(header).toHaveClass('pb-4', 'border-b', 'border-gray-200')
    })
  })

  describe('Gradient Variant', () => {
    it('renders gradient background when gradient is true', () => {
      const { container } = render(<CardHeader gradient>Gradient Header</CardHeader>)
      const header = container.firstChild
      expect(header).toHaveClass('bg-gradient-to-r', 'from-optio-purple', 'to-optio-pink', 'text-white')
    })

    it('has proper padding and margin for gradient variant', () => {
      const { container } = render(<CardHeader gradient>Gradient</CardHeader>)
      const header = container.firstChild
      expect(header).toHaveClass('p-6', '-m-6', 'mb-6', 'rounded-t-xl')
    })

    it('does not have border when gradient is true', () => {
      const { container } = render(<CardHeader gradient>Gradient</CardHeader>)
      const header = container.firstChild
      expect(header).not.toHaveClass('border-b')
    })
  })

  describe('Custom Classes', () => {
    it('applies custom className', () => {
      const { container } = render(<CardHeader className="custom-header">Header</CardHeader>)
      const header = container.firstChild
      expect(header).toHaveClass('custom-header')
    })
  })
})

describe('CardBody Component', () => {
  describe('Basic Rendering', () => {
    it('renders body with children', () => {
      render(<CardBody>Body Content</CardBody>)
      expect(screen.getByText('Body Content')).toBeInTheDocument()
    })

    it('applies custom className', () => {
      const { container } = render(<CardBody className="custom-body">Body</CardBody>)
      const body = container.firstChild
      expect(body).toHaveClass('custom-body')
    })

    it('renders as a div element', () => {
      const { container } = render(<CardBody>Body</CardBody>)
      expect(container.firstChild.tagName).toBe('DIV')
    })
  })
})

describe('CardFooter Component', () => {
  describe('Basic Rendering', () => {
    it('renders footer with children', () => {
      render(<CardFooter>Footer Content</CardFooter>)
      expect(screen.getByText('Footer Content')).toBeInTheDocument()
    })

    it('shows border by default', () => {
      const { container } = render(<CardFooter>Footer</CardFooter>)
      const footer = container.firstChild
      expect(footer).toHaveClass('pt-4', 'border-t', 'border-gray-200')
    })
  })

  describe('Border Variant', () => {
    it('shows border when border is true', () => {
      const { container } = render(<CardFooter border>With Border</CardFooter>)
      const footer = container.firstChild
      expect(footer).toHaveClass('border-t', 'border-gray-200')
    })

    it('hides border when border is false', () => {
      const { container } = render(<CardFooter border={false}>No Border</CardFooter>)
      const footer = container.firstChild
      expect(footer).not.toHaveClass('border-t')
    })
  })

  describe('Custom Classes', () => {
    it('applies custom className', () => {
      const { container } = render(<CardFooter className="custom-footer">Footer</CardFooter>)
      const footer = container.firstChild
      expect(footer).toHaveClass('custom-footer')
    })
  })
})

describe('CardTitle Component', () => {
  describe('Basic Rendering', () => {
    it('renders title with children', () => {
      render(<CardTitle>Title Text</CardTitle>)
      expect(screen.getByText('Title Text')).toBeInTheDocument()
    })

    it('renders as h3 element', () => {
      render(<CardTitle>Title</CardTitle>)
      expect(screen.getByRole('heading', { level: 3, name: 'Title' })).toBeInTheDocument()
    })

    it('has bold font by default', () => {
      const { container } = render(<CardTitle>Bold Title</CardTitle>)
      const title = container.querySelector('h3')
      expect(title).toHaveClass('font-bold')
    })

    it('renders medium size by default', () => {
      const { container } = render(<CardTitle>Medium</CardTitle>)
      const title = container.querySelector('h3')
      expect(title).toHaveClass('text-xl')
    })
  })

  describe('Sizes', () => {
    it('renders small size correctly', () => {
      const { container } = render(<CardTitle size="sm">Small Title</CardTitle>)
      const title = container.querySelector('h3')
      expect(title).toHaveClass('text-lg')
    })

    it('renders medium size correctly', () => {
      const { container } = render(<CardTitle size="md">Medium Title</CardTitle>)
      const title = container.querySelector('h3')
      expect(title).toHaveClass('text-xl')
    })

    it('renders large size correctly', () => {
      const { container } = render(<CardTitle size="lg">Large Title</CardTitle>)
      const title = container.querySelector('h3')
      expect(title).toHaveClass('text-2xl')
    })
  })

  describe('Custom Classes', () => {
    it('applies custom className', () => {
      const { container } = render(<CardTitle className="custom-title">Title</CardTitle>)
      const title = container.querySelector('h3')
      expect(title).toHaveClass('custom-title')
    })

    it('preserves default classes with custom className', () => {
      const { container } = render(<CardTitle className="text-purple-600">Title</CardTitle>)
      const title = container.querySelector('h3')
      expect(title).toHaveClass('text-purple-600', 'font-bold', 'text-xl')
    })
  })
})

describe('Card Component Family - Integration', () => {
  it('renders complete card with all sub-components', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
        </CardHeader>
        <CardBody>
          <p>Card body content</p>
        </CardBody>
        <CardFooter>
          <button>Action</button>
        </CardFooter>
      </Card>
    )

    expect(screen.getByRole('heading', { name: 'Card Title' })).toBeInTheDocument()
    expect(screen.getByText('Card body content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
  })

  it('renders card with gradient header', () => {
    const { container } = render(
      <Card variant="outlined">
        <CardHeader gradient>
          <CardTitle>Gradient Header</CardTitle>
        </CardHeader>
        <CardBody>Content</CardBody>
      </Card>
    )

    const header = container.querySelector('.bg-gradient-to-r')
    expect(header).toBeInTheDocument()
    expect(header).toHaveClass('from-optio-purple', 'to-optio-pink')
  })

  it('renders clickable card with hover effect', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(
      <Card onClick={handleClick} variant="elevated">
        <CardBody>Click me</CardBody>
      </Card>
    )

    await user.click(screen.getByText('Click me'))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
