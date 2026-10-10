import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SchoolSetupLinksModal from './SchoolSetupLinksModal'

/**
 * School setup links can turn features on for the school they create
 * (Apogee NoCo, 2026-10-09: Tasks on from the first minute).
 */

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

const renderModal = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SchoolSetupLinksModal onClose={vi.fn()} />
  </QueryClientProvider>,
)

describe('SchoolSetupLinksModal', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({ data: {
      links: [{ id: 'l1', status: 'open', created_at: '2026-10-09T00:00:00Z', url: 'u',
        school_name_hint: 'Apogee NoCo', answers: { start_modules: ['tasks'] } }],
      start_module_options: [{ key: 'tasks', name: 'Tasks, forms and signatures' },
        { key: 'attendance', name: 'Attendance' }],
    } })
    api.post.mockResolvedValue({ data: { link: { url: 'https://x/start-school/t' } } })
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } })
  })

  it('sends the features picked to turn on', async () => {
    renderModal()
    fireEvent.click(await screen.findByLabelText('Tasks, forms and signatures'))
    fireEvent.click(screen.getByRole('button', { name: /Make a link/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].start_modules).toEqual(['tasks'])
  })

  it('shows what an existing link turns on', async () => {
    renderModal()
    expect(await screen.findByText('Turns on: Tasks, forms and signatures')).toBeInTheDocument()
  })
})
