import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EvidenceImage, isDeviceOnlyUrl } from './SubmissionsPanel'

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

/**
 * Ticket d0cc8d45 (Arete, 2026-10-14): "maci's screenshot isn't showing, just
 * the filename with the generic thumbnail."
 *
 * The block was a Link whose URL was a path on the student's Chromebook
 * (file:///home/chronos/.../Screenshot ... .png). The file was never uploaded,
 * and a web page cannot load a file: URL, so the reviewer saw a broken-image
 * icon beside the file name. Any picture that fails to load (an expired
 * signed URL, a deleted object) now falls back to a text link too.
 */

const DEVICE_URL = 'file:///home/chronos/u-1ac4883df0affc63cfcb2da294ba28f9ccdf2b9f/MyFiles/Downloads/Screenshot%202026-07-23%208.43.22%20AM.png'
const SIGNED_URL = 'https://auth.optioeducation.com/storage/v1/object/sign/quest-evidence/evidence-tasks/u1/t1_20260908_133326_unnamed_1.webp?token=abc'

describe('EvidenceImage (ticket d0cc8d45)', () => {
  it('says a device-only file was never uploaded, with no image and no dead link', () => {
    const { container } = render(<EvidenceImage item={{ url: DEVICE_URL, title: '' }} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(screen.getByText('Screenshot 2026-07-23 8.43.22 AM.png')).toBeInTheDocument()
    expect(screen.getByText(/is saved only on the student's device\. It was never uploaded/)).toBeInTheDocument()
  })

  it('shows the picture while it loads, and the file as a text link when it fails', () => {
    const { container } = render(<EvidenceImage item={{ url: SIGNED_URL, filename: 'unnamed (1).webp' }} />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', SIGNED_URL)

    fireEvent.error(img)

    expect(container.querySelector('img')).toBeNull()
    const link = screen.getByRole('link', { name: 'Open file: unnamed (1).webp' })
    expect(link).toHaveAttribute('href', SIGNED_URL)
  })

  it('treats only device schemes as device-only', () => {
    expect(isDeviceOnlyUrl(DEVICE_URL)).toBe(true)
    expect(isDeviceOnlyUrl('blob:https://app.optioeducation.com/1234')).toBe(true)
    expect(isDeviceOnlyUrl('content://media/external/images/1')).toBe(true)
    expect(isDeviceOnlyUrl(SIGNED_URL)).toBe(false)
    expect(isDeviceOnlyUrl('https://docs.google.com/document/d/x')).toBe(false)
    expect(isDeviceOnlyUrl(null)).toBe(false)
  })
})
