import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => () => Promise.resolve(true) }))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import FormBuilder from '../../components/sis/tasks/FormBuilder'
import { SubmitForm } from './StaffFormsPage'

const TEMPLATE = {
  id: 't1', key: 'behavior_note', name: 'Behaviour note', audience: 'staff',
  is_active: true, description: 'Use this the same day it happens.',
  fields: [
    { key: 'child', label: 'Which child?', type: 'student', required: true, options: [] },
    { key: 'what', label: 'What happened?', type: 'long_text', required: true, options: [] },
    { key: 'severity', label: 'Severity', type: 'select', required: false, options: ['Low', 'High'] },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { templates: [TEMPLATE] } })
  api.post.mockResolvedValue({ data: { success: true } })
  api.put.mockResolvedValue({ data: { success: true } })
  api.delete.mockResolvedValue({ data: { success: true } })
})

describe('FormBuilder', () => {
  const open = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Forms/ }))
  }

  it('lists the school’s own forms with their question count', async () => {
    render(<FormBuilder orgId="org-1" />)
    await open()
    expect(await screen.findByText('Behaviour note')).toBeInTheDocument()
    expect(screen.getByText('3 questions')).toBeInTheDocument()
  })

  it('retires a form rather than making the office delete it', async () => {
    render(<FormBuilder orgId="org-1" />)
    await open()
    fireEvent.click(await screen.findByRole('button', { name: 'Retire' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/staff-admin/form-templates/t1',
      expect.objectContaining({ is_active: false }),
    ))
  })

  it('offers to delete anyway when submissions exist', async () => {
    // 409 carries the count; confirming re-sends with ?force=1 so history is
    // never destroyed without the office saying so twice.
    api.delete
      .mockRejectedValueOnce({ response: { status: 409, data: { submission_count: 4, error: '4 submissions have been filed' } } })
      .mockResolvedValueOnce({ data: { success: true } })
    render(<FormBuilder orgId="org-1" />)
    await open()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(2))
    expect(api.delete.mock.calls[1][0]).toContain('force=1')
  })

  it('saves a new form with its questions', async () => {
    render(<FormBuilder orgId="org-1" />)
    fireEvent.click(await screen.findByRole('button', { name: '+ New form' }))
    fireEvent.change(screen.getByLabelText('Form name'), { target: { value: 'Supply request' } })
    fireEvent.change(screen.getByPlaceholderText('Question 1'), { target: { value: 'What do you need?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save form' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/staff-admin/form-templates',
      expect.objectContaining({
        name: 'Supply request',
        fields: [expect.objectContaining({ label: 'What do you need?' })],
      }),
    ))
  })

  it('duplicating a question does not copy its key', async () => {
    render(<FormBuilder orgId="org-1" />)
    await open()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getAllByTitle('Duplicate this question')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Save form' }))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const sent = api.put.mock.calls[0][1].fields
    // The copy sits right after the original and carries no key of its own.
    expect(sent[1].label).toBe('Which child? (copy)')
    expect(sent[1].key).toBeUndefined()
  })
})

describe('Filling in an org-defined form', () => {
  const FORMS = [
    { key: 'behavior_note', name: 'Behaviour note', description: TEMPLATE.description, fields: TEMPLATE.fields },
    { key: 'incident', name: 'Incident report', fields: [] },
  ]

  it('asks the form’s own questions, not the built-in three', async () => {
    render(<SubmitForm orgId="org-1" formTypes={{}} forms={FORMS} onSubmitted={vi.fn()} />)
    expect(screen.getByText('What happened?')).toBeInTheDocument()
    expect(screen.getByText('Severity')).toBeInTheDocument()
    expect(screen.getByText('Use this the same day it happens.')).toBeInTheDocument()
    // The classic free-text prompt belongs to the built-in form only.
    expect(screen.queryByPlaceholderText('What happened / what do you need?')).toBeNull()
  })

  it('sends the answers keyed by question', async () => {
    render(<SubmitForm orgId="org-1" formTypes={{}} forms={FORMS} onSubmitted={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox', { name: /What happened/ }),
      { target: { value: 'Pushed in line' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Severity' }), { target: { value: 'High' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/teacher/forms',
      expect.objectContaining({
        form_type: 'behavior_note',
        answers: expect.objectContaining({ what: 'Pushed in line', severity: 'High' }),
      }),
    ))
  })

  it('falls back to the classic form for a built-in type', async () => {
    render(<SubmitForm orgId="org-1" formTypes={{}} forms={FORMS} onSubmitted={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Form type'), { target: { value: 'incident' } })
    expect(screen.getByPlaceholderText('What happened / what do you need?')).toBeInTheDocument()
  })
})
