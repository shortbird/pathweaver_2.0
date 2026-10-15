/**
 * Ticket d0cc8d45 follow-up (2026-10-15): the SIS Submissions review now reads
 * evidence through the credit grader's EvidenceBlockCard, so the card took on
 * the panel's rule that a picture which fails to load (an expired signed URL,
 * a deleted object) becomes a text link to the file, not a broken-image icon.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EvidenceBlockCard from './EvidenceBlockCard'

const SIGNED = 'https://auth.optioeducation.com/storage/v1/object/sign/quest-evidence/u1/photo.webp?token=abc'

describe('EvidenceBlockCard, a picture that will not load', () => {
  it.each(['image', 'link'])('in a %s block falls back to the file as a link', (block_type) => {
    const { container } = render(<EvidenceBlockCard block={{ id: 'b1', block_type,
      content: { items: [{ url: SIGNED, filename: 'photo.webp' }] } }} />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', SIGNED)
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('link', { name: 'Open file: photo.webp' })).toHaveAttribute('href', SIGNED)
  })
})
