import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TreehouseQuickCapture from './TreehouseQuickCapture'
import api from '../../services/api'

vi.mock('../../services/api', () => ({
  default: { post: vi.fn() },
}))

vi.mock('react-hot-toast', () => {
  const toast = { success: vi.fn(), error: vi.fn() }
  return { default: toast, toast }
})

// jsdom has no camera: CameraCaptureButton falls back to its file input, which
// is the same path a laptop without a webcam takes.
const takePhoto = (container) => {
  const file = new File(['jpeg-bytes'], 'photo.jpg', { type: 'image/jpeg' })
  const input = container.querySelector('input[type="file"]')
  fireEvent.change(input, { target: { files: [file] } })
}

const postedTo = (url) => api.post.mock.calls.find(([called]) => called === url)

describe('TreehouseQuickCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:preview')
    global.URL.revokeObjectURL = vi.fn()
    api.post.mockImplementation((url) => {
      if (url === '/api/learning-events/quick') {
        return Promise.resolve({ data: { success: true, event: { id: 'ev1' } } })
      }
      if (url === '/api/learning-events/ev1/upload') {
        return Promise.resolve({
          data: {
            success: true,
            file_url: 'evidence/ev1/photo.jpg',
            display_url: 'https://signed.example/photo.jpg?expires=soon',
            filename: 'photo.jpg',
          },
        })
      }
      return Promise.resolve({ data: { success: true } })
    })
  })

  it('captures a photo, then a caption, and saves the moment with its evidence', async () => {
    const { container } = render(<TreehouseQuickCapture className="tile" />)
    takePhoto(container)

    await waitFor(() => expect(screen.getByText('Nice work!')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('What is it?'), {
      target: { value: 'I built a birdhouse' },
    })
    fireEvent.click(screen.getByText('✓ Keep it in my portfolio'))

    await waitFor(() => expect(postedTo('/api/learning-events/ev1/evidence')).toBeTruthy())

    expect(postedTo('/api/learning-events/quick')[1]).toEqual({
      description: 'I built a birdhouse',
    })
    const evidence = postedTo('/api/learning-events/ev1/evidence')[1]
    expect(evidence.blocks[0].block_type).toBe('image')
    expect(evidence.blocks[0].content.caption).toBe('I built a birdhouse')
    // The durable pointer is stored; the signed twin expires.
    expect(evidence.blocks[0].file_url).toBe('evidence/ev1/photo.jpg')
    expect(JSON.stringify(evidence)).not.toContain('signed.example')
  })

  it('falls back to a readable description when the caption is left blank', async () => {
    const { container } = render(<TreehouseQuickCapture className="tile" />)
    takePhoto(container)

    await waitFor(() => expect(screen.getByText('Nice work!')).toBeInTheDocument())
    fireEvent.click(screen.getByText('✓ Keep it in my portfolio'))

    await waitFor(() => expect(postedTo('/api/learning-events/quick')).toBeTruthy())
    expect(postedTo('/api/learning-events/quick')[1]).toEqual({
      description: 'Photo of my work',
    })
  })

  it('closes the sheet after a save so the next photo starts clean', async () => {
    const { container } = render(<TreehouseQuickCapture className="tile" />)
    takePhoto(container)

    await waitFor(() => expect(screen.getByText('Nice work!')).toBeInTheDocument())
    fireEvent.click(screen.getByText('✓ Keep it in my portfolio'))

    await waitFor(() => expect(screen.queryByText('Nice work!')).not.toBeInTheDocument())
  })

  it('keeps the photo when saving fails, so the work is not lost', async () => {
    api.post.mockRejectedValueOnce(new Error('offline'))
    const { container } = render(<TreehouseQuickCapture className="tile" />)
    takePhoto(container)

    await waitFor(() => expect(screen.getByText('Nice work!')).toBeInTheDocument())
    fireEvent.click(screen.getByText('✓ Keep it in my portfolio'))

    await waitFor(() => expect(screen.getByText('✓ Keep it in my portfolio')).toBeEnabled())
    expect(screen.getByText('Nice work!')).toBeInTheDocument()
  })
})
