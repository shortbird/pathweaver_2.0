import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useMediaAttachments from './useMediaAttachments'

describe('useMediaAttachments', () => {
  it('rejects a 0-byte file with an iCloud-aware message and does not add it', async () => {
    // iPhone + iCloud "Optimize Storage": the full-res original lives in iCloud
    // and the file input can hand back an empty (0-byte) file, especially on a
    // weak connection. Catch it client-side with an actionable message instead
    // of uploading nothing and failing server-side.
    const { result } = renderHook(() => useMediaAttachments())
    const emptyFile = new File([], 'IMG_0001.HEIC', { type: 'image/heic' })

    let outcome
    await act(async () => {
      outcome = await result.current.addFiles([emptyFile], 'camera')
    })

    expect(outcome.errors).toHaveLength(1)
    expect(outcome.errors[0]).toMatch(/iCloud/i)
    expect(result.current.attachments).toHaveLength(0)
  })

  it('reports the empty-file error but still adds other valid files in the same batch', async () => {
    const { result } = renderHook(() => useMediaAttachments())
    const emptyFile = new File([], 'IMG_0001.HEIC', { type: 'image/heic' })
    const goodFile = new File(['pdf-bytes'], 'notes.pdf', { type: 'application/pdf' })

    let outcome
    await act(async () => {
      outcome = await result.current.addFiles([emptyFile, goodFile], 'document')
    })

    expect(outcome.errors).toHaveLength(1)
    expect(outcome.errors[0]).toMatch(/iCloud/i)
    expect(result.current.attachments).toHaveLength(1)
    expect(result.current.attachments[0].filename).toBe('notes.pdf')
  })
})
