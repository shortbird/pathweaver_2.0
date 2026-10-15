/**
 * Ticket d0cc8d45: a Chromebook student pasted
 * file:///home/chronos/.../Screenshot ....png into the evidence Link picker.
 * The reviewer's evidence card judged the .png by its URL and drew a broken
 * image. A path on the student's own device now says it was never uploaded;
 * a real picture link still renders as a picture.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EvidenceBlockCard from './EvidenceBlockCard'

const LOCAL =
  'file:///home/chronos/u-3f2a9c/MyFiles/Downloads/Screenshot 2026-07-23 8.43.22 AM.png'
const PICTURE = 'https://cdn.example/quest-evidence/u/poster.png?token=abc'

const card = (block_type, url, title = '') =>
  render(<EvidenceBlockCard block={{ id: 'b1', block_type, content: { items: [{ url, title }] } }} />)

describe('EvidenceBlockCard local paths (ticket d0cc8d45)', () => {
  it('a local path in a link block says it is only on the student device, with no image', () => {
    const { container } = card('link', LOCAL, LOCAL)
    expect(screen.getByText('Screenshot 2026-07-23 8.43.22 AM.png')).toBeInTheDocument()
    expect(screen.getByText(/is saved only on the student.s device/)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('a local path in an image block says the same, with no image', () => {
    const { container } = card('image', LOCAL)
    expect(screen.getByText(/is saved only on the student.s device/)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('a real picture pasted as a link still renders as a picture', () => {
    const { container } = card('link', PICTURE, 'Poster')
    expect(container.querySelector('img')?.getAttribute('src')).toBe(PICTURE)
    expect(screen.queryByText(/saved only on the student/)).not.toBeInTheDocument()
  })
})
