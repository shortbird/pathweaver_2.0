import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FamilyCover from './FamilyCover'

/**
 * The family photo across the top of /family: a placeholder that invites one,
 * the photo once set, and Change / Remove.
 */

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'parent-1' } }) }))
const confirmMock = vi.fn(() => Promise.resolve(true))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => confirmMock }))
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ default: toast }))
vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
import api from '../../services/api'

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FamilyCover />
    </QueryClientProvider>
  )
}

describe('FamilyCover', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invites a photo when there is none', async () => {
    api.get.mockResolvedValue({ data: { success: true, family_cover_url: null } })
    renderIt()
    expect(await screen.findByRole('button', { name: /Add a family photo/ })).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows the photo once set, with Change and Remove', async () => {
    api.get.mockResolvedValue({ data: { success: true, family_cover_url: 'https://cdn/family.jpg' } })
    renderIt()
    expect(await screen.findByRole('img', { name: 'Our family' })).toHaveAttribute('src', 'https://cdn/family.jpg')
    expect(screen.getByRole('button', { name: /Change photo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove the family photo' })).toBeInTheDocument()
  })

  it('uploads the chosen image as the family cover', async () => {
    api.get.mockResolvedValue({ data: { success: true, family_cover_url: null } })
    api.post.mockResolvedValue({ data: { success: true, family_cover_url: 'https://cdn/new.jpg' } })
    const { container } = renderIt()
    await screen.findByRole('button', { name: /Add a family photo/ })
    const file = new File(['x'], 'us.png', { type: 'image/png' })
    await userEvent.upload(container.querySelector('input[type="file"]'), file)
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/parent/family-cover', expect.any(FormData), { headers: { 'Content-Type': 'multipart/form-data' } })
    })
    expect(api.post.mock.calls[0][1].get('cover')).toBe(file)
    expect(await screen.findByRole('img', { name: 'Our family' })).toHaveAttribute('src', 'https://cdn/new.jpg')
  })

  it('removes the photo after a confirm', async () => {
    api.get.mockResolvedValue({ data: { success: true, family_cover_url: 'https://cdn/family.jpg' } })
    api.delete.mockResolvedValue({ data: { success: true, family_cover_url: null } })
    renderIt()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove the family photo' }))
    expect(confirmMock).toHaveBeenCalled()
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/parent/family-cover'))
    expect(await screen.findByRole('button', { name: /Add a family photo/ })).toBeInTheDocument()
  })
})
