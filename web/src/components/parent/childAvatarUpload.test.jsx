import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ChildAvatarUpload from './ChildAvatarUpload'

/**
 * The child's picture control: a child with no picture shows the hint that
 * one can be added, and clicking the circle uploads through the guardian
 * avatar route.
 */

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'parent-1' } }) }))
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ default: toast }))
vi.mock('../../services/api', () => ({ default: { post: vi.fn() } }))
import api from '../../services/api'

function renderIt(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ChildAvatarUpload childId="romney" name="Romney Hanna" {...props} />
    </QueryClientProvider>
  )
}

describe('ChildAvatarUpload', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the initial and an add-a-picture hint when there is no picture', () => {
    renderIt({ avatarUrl: null })
    const button = screen.getByRole('button', { name: "Add a picture for Romney Hanna" })
    expect(button).toHaveTextContent('R')
    expect(button.querySelector('img')).toBeNull()
  })

  it('shows the picture, and offers to change it, when there is one', () => {
    renderIt({ avatarUrl: 'https://cdn/romney.png' })
    const button = screen.getByRole('button', { name: "Change Romney Hanna's picture" })
    expect(button.querySelector('img')).toHaveAttribute('src', 'https://cdn/romney.png')
  })

  it('uploads the chosen image through the guardian avatar route', async () => {
    api.post.mockResolvedValue({ data: { avatar_url: 'https://cdn/new.png' } })
    const onUploaded = vi.fn()
    const { container } = renderIt({ avatarUrl: null, onUploaded })
    const file = new File(['x'], 'me.png', { type: 'image/png' })
    await userEvent.upload(container.querySelector('input[type="file"]'), file)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/parent/child/romney/avatar',
        expect.any(FormData),
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
    })
    expect(api.post.mock.calls[0][1].get('avatar')).toBe(file)
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('https://cdn/new.png'))
    expect(toast.success).toHaveBeenCalledWith('Profile picture updated')
  })

  it('refuses a non-image without uploading', async () => {
    const { container } = renderIt({ avatarUrl: null })
    const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' })
    await userEvent.upload(container.querySelector('input[type="file"]'), file, { applyAccept: false })
    expect(api.post).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Please select an image file')
  })
})
