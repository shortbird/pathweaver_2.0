import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { api } = vi.hoisted(() => ({ api: { post: vi.fn(() => Promise.resolve({ data: { success: true, report_id: 'r1' } })) } }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() }, default: {} }))
vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: { id: 'org-1', name: 'iCreate' } }),
}))

import SisFeedbackFab from './SisFeedbackFab'

beforeEach(() => vi.clearAllMocks())

describe('SisFeedbackFab', () => {
  it('offers the three feedback intents', () => {
    render(<SisFeedbackFab />)
    fireEvent.click(screen.getByLabelText('Send beta feedback'))
    expect(screen.getByText('Report a bug')).toBeInTheDocument()
    expect(screen.getByText('Suggest an idea')).toBeInTheDocument()
    expect(screen.getByText("I don't understand this")).toBeInTheDocument()
  })

  it('submits an idea with report_type + page context', async () => {
    render(<SisFeedbackFab />)
    fireEvent.click(screen.getByLabelText('Send beta feedback'))
    fireEvent.click(screen.getByText('Suggest an idea'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Add bulk import' } })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/bug-reports',
      expect.objectContaining({
        message: expect.stringContaining('Add bulk import'),
        platform: 'web-sis',
        extra: expect.objectContaining({ report_type: 'idea', surface: 'sis', organization_id: 'org-1' }),
      }),
    ))
  })

  it('requires a description before sending', () => {
    render(<SisFeedbackFab />)
    fireEvent.click(screen.getByLabelText('Send beta feedback'))
    fireEvent.click(screen.getByText('Report a bug'))
    fireEvent.click(screen.getByText('Send'))
    expect(api.post).not.toHaveBeenCalled()
  })
})
