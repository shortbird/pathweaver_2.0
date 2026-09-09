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
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    // The URL must live INSIDE content — the persistence layer (backend
    // update_document_blocks) only reads block.content. Top-level
    // file_url is silently dropped, so without this the saved row would
    // be `content: {}` and the teacher view can't render the image.
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'image',
        content: expect.objectContaining({ url: 'https://cdn/pic.jpg' }),
      }),
    ])
  })

  // ── Edit flow: pre-populate from server blocks, allow add/remove, Cancel ──

  it('with initialBlocks: pre-populates editor + button reads "Save"', () => {
    render(
      <LtiEvidenceEditor
        taskId="t1"
        initialBlocks={[
          { block_type: 'text', content: { text: 'first' } },
          {
            block_type: 'image',
            content: { url: 'https://cdn/p.jpg', file_name: 'p.jpg' },
          },
        ]}
        onComplete={vi.fn()}
      />,
    )
    expect(screen.getByText('first')).toBeInTheDocument()
    expect(screen.getByText('p.jpg')).toBeInTheDocument()
    // Image preview renders from content.url (read-side compatibility).
    expect(
      screen.getByRole('img', { name: /image evidence|p\.jpg/ }),
    ).toHaveAttribute('src', 'https://cdn/p.jpg')
    // Button text reflects edit semantics + reflects the pre-populated count.
    expect(screen.getByRole('button', { name: /Save \(2\)/ })).toBeEnabled()
  })

  it('onCancel: Cancel button appears and invokes the handler', () => {
    const onCancel = vi.fn()
    render(
      <LtiEvidenceEditor
        taskId="t1"
        initialBlocks={[{ block_type: 'text', content: { text: 'hi' } }]}
        onComplete={vi.fn()}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  // ── Draft flush: typed-but-not-added text/link is included on submit ──
  // (Williamsburg testing: a pasted link was silently dropped because the
  //  tester clicked Save without clicking "Add link" first.)

  it('includes an un-added link draft when submitting', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined)
    render(<LtiEvidenceEditor taskId="t1" onComplete={onComplete} />)
    fireEvent.change(screen.getByTestId('lti-evidence-text'), {
      target: { value: 'notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }))
    // Paste a link but do NOT click "Add link" — the count still reflects it.
    fireEvent.change(screen.getByTestId('lti-evidence-link'), {
      target: { value: 'example.com/project' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Mark complete \(2\)/ }))
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'text', content: { text: 'notes' } },
        // Scheme-less paste is normalized to a usable absolute URL.
        { type: 'link', content: { url: 'https://example.com/project' } },
      ]),
    )
  })

  it('includes an un-added text draft when submitting', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined)
    render(<LtiEvidenceEditor taskId="t1" onComplete={onComplete} />)
    fireEvent.change(screen.getByTestId('lti-evidence-text'), {
      target: { value: 'typed but never added' },
    })
    // Draft alone enables submit and is flushed into the payload.
    fireEvent.click(screen.getByRole('button', { name: /Mark complete \(1\)/ }))
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'text', content: { text: 'typed but never added' } },
      ]),
    )
  })

  it('shows the backend error message when an upload is rejected', async () => {
    const err = new Error('Request failed with status code 400')
    err.response = {
      status: 400,
      data: { error: '"clip.xyz" is not a supported video format. Supported: MP4, MOV' },
    }
    uploadViaSignedUrl.mockRejectedValueOnce(err)
    render(<LtiEvidenceEditor taskId="t1" onComplete={vi.fn()} />)
    const file = new File(['x'], 'clip.xyz', { type: 'video/example' })
    const mediaInput = document.querySelector('input[accept="image/*,video/*"]')
    fireEvent.change(mediaInput, { target: { files: [file] } })
    await waitFor(() =>
      expect(
        screen.getByText(/"clip\.xyz" is not a supported video format/),
      ).toBeInTheDocument(),
    )
  })

  it('Edit flow: can remove a pre-populated block then save the rest', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined)
    render(
      <LtiEvidenceEditor
        taskId="t1"
        initialBlocks={[
          { block_type: 'text', content: { text: 'keep me' } },
          { block_type: 'text', content: { text: 'remove me' } },
        ]}
        onComplete={onComplete}
      />,
    )
    // Two "Remove" buttons (one per block). Click the second.
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' })
    fireEvent.click(removeButtons[1])
    fireEvent.click(screen.getByRole('button', { name: /Save \(1\)/ }))
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'text', content: { text: 'keep me' } }),
    ])
  })
})
