import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InlineBlockAdder from '../InlineBlockAdder'

describe('InlineBlockAdder', () => {
  const defaultProps = {
    onAddBlock: vi.fn(),
    mode: 'empty',
    position: 0
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ==================== Empty Mode Rendering ====================
  describe('Empty Mode Rendering', () => {
    it('renders instruction text in empty mode', () => {
      render(<InlineBlockAdder {...defaultProps} mode="empty" />)
      expect(screen.getByText('Add evidence to show your learning')).toBeInTheDocument()
    })

    it('renders all block type buttons in empty mode', () => {
      render(<InlineBlockAdder {...defaultProps} mode="empty" />)
      expect(screen.getByText('Text')).toBeInTheDocument()
      expect(screen.getByText('Image')).toBeInTheDocument()
      expect(screen.getByText('Video')).toBeInTheDocument()
      expect(screen.getByText('Link')).toBeInTheDocument()
      expect(screen.getByText('Document')).toBeInTheDocument()
    })

    it('renders large buttons with labels in empty mode', () => {
      const { container } = render(<InlineBlockAdder {...defaultProps} mode="empty" />)
      // Empty mode has buttons with px-4 py-2.5 classes
      const buttons = container.querySelectorAll('button.px-4')
      expect(buttons.length).toBe(5) // 5 block types
    })

    it('shows plus icon in empty mode', () => {
      const { container } = render(<InlineBlockAdder {...defaultProps} mode="empty" />)
      const plusIcon = container.querySelector('.w-8.h-8')
      expect(plusIcon).toBeInTheDocument()
    })
  })

  // ==================== Compact Mode Rendering ====================
  describe('Compact Mode Rendering', () => {
    it('renders "Add:" label in compact mode', () => {
      render(<InlineBlockAdder {...defaultProps} mode="compact" />)
      expect(screen.getByText('Add:')).toBeInTheDocument()
    })

    it('renders icon-only buttons in compact mode', () => {
      const { container } = render(<InlineBlockAdder {...defaultProps} mode="compact" />)
      // Compact mode has buttons with p-2 class
      const buttons = container.querySelectorAll('button.p-2')
      expect(buttons.length).toBe(5) // 5 block types
    })

    it('does not show block type labels in compact mode', () => {
      render(<InlineBlockAdder {...defaultProps} mode="compact" />)
      // These should be in title attributes, not visible text
      expect(screen.queryByText('Text')).not.toBeInTheDocument()
      expect(screen.queryByText('Image')).not.toBeInTheDocument()
    })

    it('has title attributes for accessibility in compact mode', () => {
      render(<InlineBlockAdder {...defaultProps} mode="compact" />)
      expect(screen.getByTitle('Add Text')).toBeInTheDocument()
      expect(screen.getByTitle('Add Image')).toBeInTheDocument()
      expect(screen.getByTitle('Add Video')).toBeInTheDocument()
      expect(screen.getByTitle('Add Link')).toBeInTheDocument()
      expect(screen.getByTitle('Add Document')).toBeInTheDocument()
    })
  })

  // ==================== Block Type Selection ====================
  describe('Block Type Selection', () => {
    it('calls onAddBlock with "text" when Text button is clicked in empty mode', async () => {
      const user = userEvent.setup()
      const onAddBlock = vi.fn()
      render(<InlineBlockAdder {...defaultProps} onAddBlock={onAddBlock} mode="empty" />)

      await user.click(screen.getByText('Text'))

      expect(onAddBlock).toHaveBeenCalledWith('text', 0)
    })

    it('calls onAddBlock with "image" when Image button is clicked in empty mode', async () => {
      const user = userEvent.setup()
      const onAddBlock = vi.fn()
      render(<InlineBlockAdder {...defaultProps} onAddBlock={onAddBlock} mode="empty" />)

      await user.click(screen.getByText('Image'))

      expect(onAddBlock).toHaveBeenCalledWith('image', 0)
    })

    it('calls onAddBlock with "video" when Video button is clicked in empty mode', async () => {
      const user = userEvent.setup()
      const onAddBlock = vi.fn()
      render(<InlineBlockAdder {...defaultProps} onAddBlock={onAddBlock} mode="empty" />)

      await user.click(screen.getByText('Video'))

      expect(onAddBlock).toHaveBeenCalledWith('video', 0)
    })

    it('calls onAddBlock with "link" when Link button is clicked in empty mode', async () => {
      const user = userEvent.setup()
      const onAddBlock = vi.fn()
      render(<InlineBlockAdder {...defaultProps} onAddBlock={onAddBlock} mode="empty" />)

      await user.click(screen.getByText('Link'))

      expect(onAddBlock).toHaveBeenCalledWith('link', 0)
    })

    it('calls onAddBlock with "document" when Document button is clicked in empty mode', async () => {
      const user = userEvent.setup()
      const onAddBlock = vi.fn()
      render(<InlineBlockAdder {...defaultProps} onAddBlock={onAddBlock} mode="empty" />)

      await user.click(screen.getByText('Document'))

      expect(onAddBlock).toHaveBeenCalledWith('document', 0)
    })

    it('calls onAddBlock in compact mode', async () => {
      const user = userEvent.setup()
      const onAddBlock = vi.fn()
      render(<InlineBlockAdder {...defaultProps} onAddBlock={onAddBlock} mode="compact" />)

      await user.click(screen.getByTitle('Add Text'))

      expect(onAddBlock).toHaveBeenCalledWith('text', 0)
    })
  })

  // ==================== Position Parameter ====================
  describe('Position Parameter', () => {
    it('passes position to onAddBlock callback', async () => {
      const user = userEvent.setup()
      const onAddBlock = vi.fn()
      render(<InlineBlockAdder onAddBlock={onAddBlock} mode="empty" position={5} />)

      await user.click(screen.getByText('Text'))

      expect(onAddBlock).toHaveBeenCalledWith('text', 5)
    })

    it('passes different position values', async () => {
      const user = userEvent.setup()
      const onAddBlock = vi.fn()
      const { rerender } = render(<InlineBlockAdder onAddBlock={onAddBlock} mode="compact" position={0} />)

      await user.click(screen.getByTitle('Add Image'))
      expect(onAddBlock).toHaveBeenCalledWith('image', 0)

      rerender(<InlineBlockAdder onAddBlock={onAddBlock} mode="compact" position={3} />)
      await user.click(screen.getByTitle('Add Video'))
      expect(onAddBlock).toHaveBeenCalledWith('video', 3)
    })

    it('handles undefined position gracefully', async () => {
      const user = userEvent.setup()
      const onAddBlock = vi.fn()
      render(<InlineBlockAdder onAddBlock={onAddBlock} mode="empty" />)

      await user.click(screen.getByText('Link'))

      expect(onAddBlock).toHaveBeenCalledWith('link', undefined)
    })
  })

  // ==================== Default Mode ====================
  describe('Default Mode', () => {
    it('defaults to empty mode when mode prop is not provided', () => {
      render(<InlineBlockAdder onAddBlock={vi.fn()} />)
      expect(screen.getByText('Add evidence to show your learning')).toBeInTheDocument()
    })
  })

  // ==================== Styling ====================
  describe('Styling', () => {
    it('has dashed border in empty mode', () => {
      const { container } = render(<InlineBlockAdder {...defaultProps} mode="empty" />)
      const borderElement = container.querySelector('.border-dashed')
      expect(borderElement).toBeInTheDocument()
    })

    it('does not have dashed border in compact mode', () => {
      const { container } = render(<InlineBlockAdder {...defaultProps} mode="compact" />)
      const borderElement = container.querySelector('.border-dashed')
      expect(borderElement).not.toBeInTheDocument()
    })

    it('buttons have hover styles in empty mode', () => {
      const { container } = render(<InlineBlockAdder {...defaultProps} mode="empty" />)
      const button = container.querySelector('button')
      expect(button.className).toContain('hover:border-optio-purple')
    })

    it('buttons have hover styles in compact mode', () => {
      const { container } = render(<InlineBlockAdder {...defaultProps} mode="compact" />)
      const button = container.querySelector('button')
      expect(button.className).toContain('hover:text-optio-purple')
    })
  })

  // ==================== All Block Types ====================
  describe('All Block Types Available', () => {
    const blockTypes = [
      { id: 'text', label: 'Text' },
      { id: 'image', label: 'Image' },
      { id: 'video', label: 'Video' },
      { id: 'link', label: 'Link' },
      { id: 'document', label: 'Document' }
    ]

    it.each(blockTypes)('renders $label button in empty mode', ({ label }) => {
      render(<InlineBlockAdder {...defaultProps} mode="empty" />)
      expect(screen.getByText(label)).toBeInTheDocument()
    })

    it.each(blockTypes)('renders Add $label title in compact mode', ({ label }) => {
      render(<InlineBlockAdder {...defaultProps} mode="compact" />)
      expect(screen.getByTitle(`Add ${label}`)).toBeInTheDocument()
    })

    it.each(blockTypes)('calls onAddBlock with "$id" when $label clicked', async ({ id, label }) => {
      const user = userEvent.setup()
      const onAddBlock = vi.fn()
      render(<InlineBlockAdder onAddBlock={onAddBlock} mode="empty" position={0} />)

      await user.click(screen.getByText(label))

      expect(onAddBlock).toHaveBeenCalledWith(id, 0)
    })
  })
})
