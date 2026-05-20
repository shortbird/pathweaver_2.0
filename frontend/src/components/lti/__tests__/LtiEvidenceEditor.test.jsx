/**
 * LtiEvidenceEditor (v1) — multi-format gating + payload shape.
 *
 * The upload helper is mocked; we don't drive a real file picker, we feed
 * the hidden <input type=file> via fireEvent.change with a File object.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LtiEvidenceEditor from '../LtiEvidenceEditor'

vi.mock('../../../services/signedUpload', () => ({
  uploadViaSignedUrl: vi.fn(),
}))
import { uploadViaSignedUrl } from '../../../services/signedUpload'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LtiEvidenceEditor', () => {
  it('Mark complete is disabled until at least one block is added', () => {
    const onComplete = vi.fn().mockResolvedValue(undefined)
    render(<LtiEvidenceEditor taskId="t1" onComplete={onComplete} />)
    const btn = screen.getByRole('button', { name: /Mark complete \(0\)/ })
    expect(btn).toBeDisabled()
  })

  it('adds a text block and submits it via onComplete', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined)
    render(<LtiEvidenceEditor taskId="t1" onComplete={onComplete} />)
    fireEvent.change(screen.getByTestId('lti-evidence-text'), {
      target: { value: 'I built a thing' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }))
    fireEvent.click(screen.getByRole('button', { name: /Mark complete \(1\)/ }))
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'text', content: { text: 'I built a thing' } },
      ]),
    )
  })

  it('adds a link block', () => {
    render(<LtiEvidenceEditor taskId="t1" onComplete={vi.fn()} />)
    fireEvent.change(screen.getByTestId('lti-evidence-link'), {
      target: { value: 'https://repo.example/x' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
    expect(
      screen.getByRole('button', { name: /Mark complete \(1\)/ }),
    ).toBeEnabled()
  })

  it('uploads a picked image via the signed-upload helper', async () => {
    uploadViaSignedUrl.mockResolvedValueOnce({
      file_url: 'https://cdn/pic.jpg',
      file_name: 'pic.jpg',
    })
    const onComplete = vi.fn().mockResolvedValue(undefined)
    render(<LtiEvidenceEditor taskId="task-9" onComplete={onComplete} />)

    const file = new File(['x'], 'pic.jpg', { type: 'image/jpeg' })
    // The media file input is hidden inside a label — query by accept.
    const mediaInput = document.querySelector('input[accept="image/*,video/*"]')
    fireEvent.change(mediaInput, { target: { files: [file] } })

    await waitFor(() =>
      expect(uploadViaSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          initPath: '/api/evidence/documents/task-9/upload-init',
          finalizePath: '/api/evidence/documents/task-9/upload-finalize',
          blockType: 'image',
        }),
      ),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Mark complete \(1\)/ }),
      ).toBeEnabled(),
    )

    fireEvent.click(screen.getByRole('button', { name: /Mark complete \(1\)/ }))
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'image',
          file_url: 'https://cdn/pic.jpg',
          file_name: 'pic.jpg',
        }),
      ]),
    )
  })
})
