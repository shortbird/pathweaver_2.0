import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EvidenceDisplay from '../EvidenceDisplay'

describe('EvidenceDisplay', () => {
  const defaultProps = {
    blocks: [],
    onEdit: vi.fn(),
    onDelete: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ==================== Empty State ====================
  describe('Empty State', () => {
    it('renders empty state when no blocks', () => {
      render(<EvidenceDisplay {...defaultProps} />)
      expect(screen.getByText('No evidence submitted yet')).toBeInTheDocument()
    })

    it('renders custom empty message', () => {
      render(<EvidenceDisplay {...defaultProps} emptyMessage="Add your first evidence" />)
      expect(screen.getByText('Add your first evidence')).toBeInTheDocument()
    })

    it('shows icon in empty state', () => {
      const { container } = render(<EvidenceDisplay {...defaultProps} />)
      expect(container.querySelector('svg')).toBeInTheDocument()
    })
  })

  // ==================== Text Block ====================
  describe('Text Block', () => {
    const textBlock = {
      id: 'block-1',
      type: 'text',
      content: { text: 'This is my reflection on the learning process.' }
    }

    it('renders text content', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[textBlock]} />)
      expect(screen.getByText('This is my reflection on the learning process.')).toBeInTheDocument()
    })

    it('shows Text type label', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[textBlock]} />)
      expect(screen.getByText('Text')).toBeInTheDocument()
    })

    it('handles block_type format (backend)', () => {
      const backendBlock = {
        id: 'block-1',
        block_type: 'text',
        content: { text: 'Backend format text' }
      }
      render(<EvidenceDisplay {...defaultProps} blocks={[backendBlock]} />)
      expect(screen.getByText('Backend format text')).toBeInTheDocument()
    })

    it('shows "No text content" for empty text', () => {
      const emptyTextBlock = {
        id: 'block-1',
        type: 'text',
        content: {}
      }
      render(<EvidenceDisplay {...defaultProps} blocks={[emptyTextBlock]} />)
      expect(screen.getByText('No text content')).toBeInTheDocument()
    })
  })

  // ==================== Image Block ====================
  describe('Image Block', () => {
    const imageBlock = {
      id: 'block-2',
      type: 'image',
      content: {
        items: [
          { url: 'https://example.com/image1.jpg', caption: 'Project photo' },
          { url: 'https://example.com/image2.jpg', alt: 'Second image' }
        ]
      }
    }

    it('renders images', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[imageBlock]} />)
      const images = screen.getAllByRole('img')
      expect(images).toHaveLength(2)
    })

    it('shows Image type label with count', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[imageBlock]} />)
      expect(screen.getByText('Image (2)')).toBeInTheDocument()
    })

    it('displays image captions', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[imageBlock]} />)
      expect(screen.getByText('Project photo')).toBeInTheDocument()
    })

    it('shows "No images" for empty items', () => {
      const emptyImageBlock = {
        id: 'block-2',
        type: 'image',
        content: { items: [] }
      }
      render(<EvidenceDisplay {...defaultProps} blocks={[emptyImageBlock]} />)
      expect(screen.getByText('No images')).toBeInTheDocument()
    })

    it('handles legacy single-item format', () => {
      const legacyBlock = {
        id: 'block-2',
        type: 'image',
        content: { url: 'https://example.com/single.jpg', caption: 'Legacy image' }
      }
      render(<EvidenceDisplay {...defaultProps} blocks={[legacyBlock]} />)
      expect(screen.getByRole('img')).toBeInTheDocument()
    })
  })

  // ==================== Video Block ====================
  describe('Video Block', () => {
    const videoBlock = {
      id: 'block-3',
      type: 'video',
      content: {
        items: [
          { url: 'https://youtube.com/watch?v=abc', title: 'My Tutorial Video' }
        ]
      }
    }

    it('renders video links', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[videoBlock]} />)
      expect(screen.getByText('My Tutorial Video')).toBeInTheDocument()
    })

    it('shows Video type label with count', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[videoBlock]} />)
      expect(screen.getByText('Video (1)')).toBeInTheDocument()
    })

    it('renders video as external link', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[videoBlock]} />)
      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', 'https://youtube.com/watch?v=abc')
      expect(link).toHaveAttribute('target', '_blank')
    })

    it('shows URL when no title provided', () => {
      const noTitleBlock = {
        id: 'block-3',
        type: 'video',
        content: {
          items: [{ url: 'https://vimeo.com/123456', title: '' }]
        }
      }
      render(<EvidenceDisplay {...defaultProps} blocks={[noTitleBlock]} />)
      expect(screen.getByText('https://vimeo.com/123456')).toBeInTheDocument()
    })

    it('shows "No videos" for empty items', () => {
      const emptyVideoBlock = {
        id: 'block-3',
        type: 'video',
        content: { items: [] }
      }
      render(<EvidenceDisplay {...defaultProps} blocks={[emptyVideoBlock]} />)
      expect(screen.getByText('No videos')).toBeInTheDocument()
    })
  })

  // ==================== Link Block ====================
  describe('Link Block', () => {
    const linkBlock = {
      id: 'block-4',
      type: 'link',
      content: {
        items: [
          { url: 'https://example.com/resource', title: 'Helpful Resource', description: 'A great learning resource' }
        ]
      }
    }

    it('renders link with title', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[linkBlock]} />)
      expect(screen.getByText('Helpful Resource')).toBeInTheDocument()
    })

    it('shows Link type label with count', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[linkBlock]} />)
      expect(screen.getByText('Link (1)')).toBeInTheDocument()
    })

    it('renders link description', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[linkBlock]} />)
      expect(screen.getByText('A great learning resource')).toBeInTheDocument()
    })

    it('shows URL below title', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[linkBlock]} />)
      expect(screen.getByText('https://example.com/resource')).toBeInTheDocument()
    })

    it('shows "Untitled link" when no title', () => {
      const noTitleBlock = {
        id: 'block-4',
        type: 'link',
        content: {
          items: [{ url: 'https://example.com', title: '' }]
        }
      }
      render(<EvidenceDisplay {...defaultProps} blocks={[noTitleBlock]} />)
      expect(screen.getByText('Untitled link')).toBeInTheDocument()
    })

    it('shows "No links" for empty items', () => {
      const emptyLinkBlock = {
        id: 'block-4',
        type: 'link',
        content: { items: [] }
      }
      render(<EvidenceDisplay {...defaultProps} blocks={[emptyLinkBlock]} />)
      expect(screen.getByText('No links')).toBeInTheDocument()
    })
  })

  // ==================== Document Block ====================
  describe('Document Block', () => {
    const documentBlock = {
      id: 'block-5',
      type: 'document',
      content: {
        items: [
          { url: 'https://example.com/file.pdf', title: 'Project Report', filename: 'report.pdf' }
        ]
      }
    }

    it('renders document with title', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[documentBlock]} />)
      expect(screen.getByText('Project Report')).toBeInTheDocument()
    })

    it('shows Document type label with count', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[documentBlock]} />)
      expect(screen.getByText('Document (1)')).toBeInTheDocument()
    })

    it('renders document as external link', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[documentBlock]} />)
      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', 'https://example.com/file.pdf')
      expect(link).toHaveAttribute('target', '_blank')
    })

    it('shows filename when different from title', () => {
      render(<EvidenceDisplay {...defaultProps} blocks={[documentBlock]} />)
      expect(screen.getByText('report.pdf')).toBeInTheDocument()
    })

    it('shows "No documents" for empty items', () => {
      const emptyDocBlock = {
        id: 'block-5',
        type: 'document',
        content: { items: [] }
      }
      render(<EvidenceDisplay {...defaultProps} blocks={[emptyDocBlock]} />)
      expect(screen.getByText('No documents')).toBeInTheDocument()
    })
  })

  // ==================== Actions ====================
  describe('Actions', () => {
    const textBlock = {
      id: 'block-1',
      type: 'text',
      content: { text: 'Test content' }
    }

    it('calls onDelete when delete button is clicked', async () => {
      const user = userEvent.setup()
      const onDelete = vi.fn()
      render(<EvidenceDisplay {...defaultProps} blocks={[textBlock]} onDelete={onDelete} />)

      // Hover to reveal actions
      const block = screen.getByText('Test content').closest('.group')

      // Find delete button by its title
      const deleteButton = screen.getByTitle('Delete')
      await user.click(deleteButton)

      expect(onDelete).toHaveBeenCalledWith('block-1')
    })

    it('calls onEdit when edit button is clicked', async () => {
      const user = userEvent.setup()
      const onEdit = vi.fn()
      render(<EvidenceDisplay {...defaultProps} blocks={[textBlock]} onEdit={onEdit} />)

      const editButton = screen.getByTitle('Edit')
      await user.click(editButton)

      expect(onEdit).toHaveBeenCalledWith(textBlock)
    })

    it('does not show edit button when onEdit is not provided', () => {
      render(<EvidenceDisplay blocks={[textBlock]} onDelete={vi.fn()} />)
      expect(screen.queryByTitle('Edit')).not.toBeInTheDocument()
    })

    it('does not show delete button when onDelete is not provided', () => {
      render(<EvidenceDisplay blocks={[textBlock]} onEdit={vi.fn()} />)
      expect(screen.queryByTitle('Delete')).not.toBeInTheDocument()
    })
  })

  // ==================== Private Indicator ====================
  describe('Private Indicator', () => {
    it('shows private indicator for private blocks', () => {
      const privateBlock = {
        id: 'block-1',
        type: 'text',
        content: { text: 'Private note' },
        is_private: true
      }
      render(<EvidenceDisplay {...defaultProps} blocks={[privateBlock]} />)
      expect(screen.getByText('Private - only visible to you')).toBeInTheDocument()
    })

    it('does not show private indicator for public blocks', () => {
      const publicBlock = {
        id: 'block-1',
        type: 'text',
        content: { text: 'Public note' },
        is_private: false
      }
      render(<EvidenceDisplay {...defaultProps} blocks={[publicBlock]} />)
      expect(screen.queryByText('Private - only visible to you')).not.toBeInTheDocument()
    })
  })

  // ==================== Multiple Blocks ====================
  describe('Multiple Blocks', () => {
    it('renders multiple blocks in order', () => {
      const blocks = [
        { id: 'block-1', type: 'text', content: { text: 'First block' } },
        { id: 'block-2', type: 'text', content: { text: 'Second block' } },
        { id: 'block-3', type: 'text', content: { text: 'Third block' } }
      ]
      render(<EvidenceDisplay {...defaultProps} blocks={blocks} />)

      expect(screen.getByText('First block')).toBeInTheDocument()
      expect(screen.getByText('Second block')).toBeInTheDocument()
      expect(screen.getByText('Third block')).toBeInTheDocument()
    })

    it('renders mixed block types', () => {
      const blocks = [
        { id: 'block-1', type: 'text', content: { text: 'My notes' } },
        { id: 'block-2', type: 'link', content: { items: [{ url: 'https://example.com', title: 'Reference' }] } }
      ]
      render(<EvidenceDisplay {...defaultProps} blocks={blocks} />)

      expect(screen.getByText('My notes')).toBeInTheDocument()
      expect(screen.getByText('Reference')).toBeInTheDocument()
    })
  })

  // ==================== Block Styling ====================
  describe('Block Styling', () => {
    it('applies blue styling to text blocks', () => {
      const textBlock = {
        id: 'block-1',
        type: 'text',
        content: { text: 'Styled text' }
      }
      const { container } = render(<EvidenceDisplay {...defaultProps} blocks={[textBlock]} />)

      const blockElement = container.querySelector('.bg-blue-50')
      expect(blockElement).toBeInTheDocument()
    })

    it('applies green styling to image blocks', () => {
      const imageBlock = {
        id: 'block-1',
        type: 'image',
        content: { items: [{ url: 'test.jpg' }] }
      }
      const { container } = render(<EvidenceDisplay {...defaultProps} blocks={[imageBlock]} />)

      const blockElement = container.querySelector('.bg-green-50')
      expect(blockElement).toBeInTheDocument()
    })

    it('applies orange styling to video blocks', () => {
      const videoBlock = {
        id: 'block-1',
        type: 'video',
        content: { items: [{ url: 'https://youtube.com/test' }] }
      }
      const { container } = render(<EvidenceDisplay {...defaultProps} blocks={[videoBlock]} />)

      const blockElement = container.querySelector('.bg-orange-50')
      expect(blockElement).toBeInTheDocument()
    })

    it('applies purple styling to link blocks', () => {
      const linkBlock = {
        id: 'block-1',
        type: 'link',
        content: { items: [{ url: 'https://example.com' }] }
      }
      const { container } = render(<EvidenceDisplay {...defaultProps} blocks={[linkBlock]} />)

      const blockElement = container.querySelector('.bg-purple-50')
      expect(blockElement).toBeInTheDocument()
    })
  })
})
