import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import toast from 'react-hot-toast'
import StepEditor from '../StepEditor'
import * as crmApi from '../crmApi'

vi.mock('../crmApi', () => ({
  getFunnel: vi.fn(),
  updateStep: vi.fn(),
  testSendStep: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const funnelResponse = {
  funnel: { id: 'f1', name: 'Free Class Nurture' },
  steps: [
    {
      id: 's1',
      step_order: 1,
      name: 'Welcome',
      subject: 'Welcome to Optio',
      html_body: '<p>Hello {{first_name}}, <a href="{{unsubscribe_url}}">unsubscribe</a></p>',
      delay_hours: 1,
      is_active: true,
    },
  ],
}

const renderEditor = () =>
  render(
    <MemoryRouter initialEntries={['/admin/crm/funnels/f1/steps/s1']}>
      <Routes>
        <Route path="/admin/crm/funnels/:funnelId/steps/:stepId" element={<StepEditor />} />
      </Routes>
    </MemoryRouter>
  )

describe('StepEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    crmApi.getFunnel.mockResolvedValue({ data: funnelResponse })
    crmApi.updateStep.mockResolvedValue({ data: {} })
    crmApi.testSendStep.mockResolvedValue({ data: {} })
  })

  it('loads the step content from the funnel payload', async () => {
    renderEditor()
    expect(await screen.findByLabelText('Step name')).toHaveValue('Welcome')
    expect(screen.getByLabelText('Subject')).toHaveValue('Welcome to Optio')
    expect(screen.getByLabelText('Email HTML source')).toHaveValue(
      funnelResponse.steps[0].html_body
    )
  })

  it('renders a sandboxed preview with sample variable substitution', async () => {
    const { container } = renderEditor()
    await screen.findByLabelText('Step name')
    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe.getAttribute('sandbox')).toBe('')
    const srcdoc = iframe.getAttribute('srcdoc')
    expect(srcdoc).toContain('Jordan')
    expect(srcdoc).toContain('href="#"')
    expect(srcdoc).not.toContain('{{first_name}}')
  })

  it('inserts a variable chip into the HTML source', async () => {
    renderEditor()
    await screen.findByLabelText('Step name')
    fireEvent.click(screen.getByRole('button', { name: '{{last_name}}' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Email HTML source').value).toContain('{{last_name}}')
    )
  })

  it('sends a test with the CURRENT unsaved draft content', async () => {
    renderEditor()
    await screen.findByLabelText('Step name')
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Unsaved subject' },
    })
    fireEvent.change(screen.getByLabelText('Email HTML source'), {
      target: { value: '<p>Unsaved body</p>' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send test to me' }))
    await waitFor(() =>
      expect(crmApi.testSendStep).toHaveBeenCalledWith('s1', {
        subject: 'Unsaved subject',
        html_body: '<p>Unsaved body</p>',
      })
    )
    expect(crmApi.updateStep).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
  })

  it('saves the step with name, subject and html_body', async () => {
    renderEditor()
    await screen.findByLabelText('Step name')
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'New subject' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    await waitFor(() =>
      expect(crmApi.updateStep).toHaveBeenCalledWith('s1', {
        name: 'Welcome',
        subject: 'New subject',
        html_body: funnelResponse.steps[0].html_body,
      })
    )
  })

  it('surfaces a failed test send as a toast error', async () => {
    crmApi.testSendStep.mockRejectedValue({ response: { data: { error: 'SendGrid down' } } })
    renderEditor()
    await screen.findByLabelText('Step name')
    fireEvent.click(screen.getByRole('button', { name: 'Send test to me' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('SendGrid down'))
  })

  it('shows a not-found state for an unknown step id', async () => {
    crmApi.getFunnel.mockResolvedValue({
      data: { funnel: { id: 'f1', name: 'Free Class Nurture' }, steps: [] },
    })
    renderEditor()
    expect(await screen.findByText('Step not found')).toBeInTheDocument()
  })
})
