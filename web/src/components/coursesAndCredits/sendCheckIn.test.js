import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendCheckIn } from './sendCheckIn'

const apiPost = vi.fn()
vi.mock('../../services/api', () => ({ default: { post: (...a) => apiPost(...a) } }))

const uploadFile = vi.fn()
const getDocument = vi.fn()
const saveDocument = vi.fn()
vi.mock('../../services/evidenceDocumentService', () => ({
  evidenceDocumentService: {
    uploadFile: (...a) => uploadFile(...a),
    getDocument: (...a) => getDocument(...a),
    saveDocument: (...a) => saveDocument(...a),
  },
}))

const photo = new File(['x'], 'page-12.jpg', { type: 'image/jpeg' })
const pdf = new File(['x'], 'unit-test.pdf', { type: 'application/pdf' })

describe('sendCheckIn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uploadFile.mockImplementation(async (file) => ({ success: true, url: `quest-evidence/${file.name}` }))
    getDocument.mockResolvedValue({ success: true, blocks: [] })
    saveDocument.mockResolvedValue({ success: true })
    apiPost.mockResolvedValue({ data: { data: { diploma_status: 'pending_review' } } })
  })

  it("uploads the files, saves them as the child's completed evidence, then requests credit", async () => {
    await sendCheckIn({ taskId: 't1', files: [photo, pdf], note: ' Lessons 1-60 ', studentId: 'kid' })

    expect(uploadFile).toHaveBeenCalledWith(photo, 't1', { studentId: 'kid', blockType: 'image' })
    expect(uploadFile).toHaveBeenCalledWith(pdf, 't1', { studentId: 'kid', blockType: 'document' })
    const [taskId, blocks, status, opts] = saveDocument.mock.calls[0]
    expect([taskId, status, opts]).toEqual(['t1', 'completed', { studentId: 'kid' }])
    expect(blocks).toEqual([
      { type: 'text', content: { text: 'Lessons 1-60' } },
      { type: 'image', content: { items: [{ url: 'quest-evidence/page-12.jpg', filename: 'page-12.jpg', title: 'page-12.jpg' }] } },
      { type: 'document', content: { items: [{ url: 'quest-evidence/unit-test.pdf', filename: 'unit-test.pdf', title: 'unit-test.pdf' }] } },
    ])
    expect(apiPost).toHaveBeenCalledWith('/api/tasks/t1/request-credit', { student_id: 'kid' })
    // Credit is requested only after the evidence is saved.
    expect(saveDocument.mock.invocationCallOrder[0]).toBeLessThan(apiPost.mock.invocationCallOrder[0])
  })

  it('adds to a check-in that was sent back instead of replacing what is there', async () => {
    getDocument.mockResolvedValue({
      success: true,
      blocks: [{ id: 'b1', block_type: 'image', content: { items: [{ url: 'quest-evidence/old.jpg' }] }, is_private: false }],
    })
    await sendCheckIn({ taskId: 't1', files: [photo], studentId: 'kid' })

    const blocks = saveDocument.mock.calls[0][1]
    expect(blocks[0]).toEqual({ id: 'b1', type: 'image', content: { items: [{ url: 'quest-evidence/old.jpg' }] }, is_private: false })
    expect(blocks).toHaveLength(2)
  })

  it('retries only the credit request when nothing new was added', async () => {
    await sendCheckIn({ taskId: 't1', studentId: 'kid' })
    expect(uploadFile).not.toHaveBeenCalled()
    expect(saveDocument).not.toHaveBeenCalled()
    expect(apiPost).toHaveBeenCalledWith('/api/tasks/t1/request-credit', { student_id: 'kid' })
  })

  it('writes nothing when an upload fails', async () => {
    uploadFile.mockResolvedValueOnce({ success: false, error: 'File type not allowed' })
    await expect(sendCheckIn({ taskId: 't1', files: [photo], studentId: 'kid' })).rejects.toThrow('File type not allowed')
    expect(saveDocument).not.toHaveBeenCalled()
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('marks a failed request after a good save, so a retry does not upload twice', async () => {
    apiPost.mockRejectedValueOnce({ response: { status: 500, data: { error: 'boom', error_detail: { code: 'CREDIT_REQUEST_ERROR' } } } })
    const err = await sendCheckIn({ taskId: 't1', files: [photo], studentId: 'kid' }).catch((e) => e)
    expect(err.evidenceSaved).toBe(true)
    expect(saveDocument).toHaveBeenCalledTimes(1)
  })

  it('treats "already pending" as sent', async () => {
    apiPost.mockRejectedValueOnce({ response: { status: 400, data: { error: 'pending', error_detail: { code: 'ALREADY_PENDING' } } } })
    await expect(sendCheckIn({ taskId: 't1', studentId: 'kid' })).resolves.toEqual({ diploma_status: 'pending_review' })
  })
})
