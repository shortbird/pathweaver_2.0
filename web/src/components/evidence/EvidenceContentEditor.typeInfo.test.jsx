/**
 * Ticket 9c55b29d (Sentry optio-web 7777415203, 2026-10-06): a student opened
 * a photo on a quest page to edit it, pressed the back arrow, then picked a
 * type, and the modal died with "Cannot read properties of undefined
 * (reading 'Icon')". Back copied the image block into the "Added evidence"
 * list, and that list looked its icon up in EVIDENCE_TYPES, which only knows
 * the picker's types (text, camera, link, document), never image or video.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EvidenceContentEditor, { evidenceTypeInfo } from './EvidenceContentEditor'

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))

const BACK_CHEVRON = 'M15 19l-7-7 7-7'

const imageBlock = {
  id: 'b1',
  type: 'image',
  content: { items: [{ url: 'https://cdn.example/photo.jpg', filename: 'photo.jpg' }] },
}

describe('evidence type lookup (ticket 9c55b29d)', () => {
  it('knows image and video, which camera items are split into', () => {
    expect(evidenceTypeInfo('image').label).toBe('Photo')
    expect(evidenceTypeInfo('image').Icon).toBeTruthy()
    expect(evidenceTypeInfo('video').label).toBe('Video')
    expect(evidenceTypeInfo('video').Icon).toBeTruthy()
  })

  it('falls back to a generic entry for a type it has never seen', () => {
    const info = evidenceTypeInfo('hologram')
    expect(info.label).toBe('Evidence')
    expect(info.Icon).toBeTruthy()
  })

  it('still answers the picker types from EVIDENCE_TYPES', () => {
    expect(evidenceTypeInfo('camera').label).toBe('Camera')
    expect(evidenceTypeInfo('link').label).toBe('Link')
  })
})

describe('editing one image block (ticket 9c55b29d)', () => {
  it('names the block in the heading instead of "Add undefined"', () => {
    render(<EvidenceContentEditor onSave={vi.fn()} onCancel={vi.fn()} onUpdate={vi.fn()} editingBlock={imageBlock} />)
    expect(screen.getByRole('heading', { name: 'Add Photo' })).toBeInTheDocument()
  })

  it('offers no back arrow, so the block cannot be copied into the list and overwritten', () => {
    const { container } = render(<EvidenceContentEditor onSave={vi.fn()} onCancel={vi.fn()} onUpdate={vi.fn()} editingBlock={imageBlock} />)
    // Found by its chevron, not its label, so the old unlabelled arrow counts too.
    expect(container.querySelector(`path[d="${BACK_CHEVRON}"]`)).toBeNull()
  })

  it('add mode keeps the back arrow and lists an added item without crashing', () => {
    render(<EvidenceContentEditor onSave={vi.fn()} onCancel={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByText('Link'))
    expect(screen.getByRole('button', { name: 'Back to evidence types' })).toBeInTheDocument()
  })
})
