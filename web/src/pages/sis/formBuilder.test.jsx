import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
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

import { toast } from 'react-hot-toast'
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
  api.get.mockResolvedValue({ data: {
    templates: [TEMPLATE],
    builtins: [
      { key: 'incident', name: 'Incident report', hidden: false },
      { key: 'reimbursement', name: 'Reimbursement request', hidden: false },
      { key: 'injury', name: 'Injury report', hidden: true },
    ],
  } })
  api.post.mockResolvedValue({ data: { success: true } })
  api.put.mockResolvedValue({ data: { success: true } })
  api.delete.mockResolvedValue({ data: { success: true } })
})

describe('FormBuilder', () => {
  const open = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Forms/ }))
  }

  // iCreate, 2026-09-02: "remove the purchase requests, class prep,
  // reimbursement request, etc." The built-ins belong to every school, so one
  // school hides what it does not use rather than deleting it for everyone.
  it('lists the built-in forms and says which are hidden', async () => {
    render(<FormBuilder orgId="org-1" />)
    await open()
    expect(await screen.findByText('Built-in forms')).toBeInTheDocument()
    expect(screen.getByText('Incident report')).toBeInTheDocument()
    expect(screen.getByText('Hidden')).toBeInTheDocument()   // Injury report
  })

  it('hides a built-in for this school only', async () => {
    api.patch.mockResolvedValue({ data: { success: true } })
    render(<FormBuilder orgId="org-1" />)
    await open()
    const row = (await screen.findByText('Reimbursement request')).closest('li')
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/staff-admin/form-templates/builtin/reimbursement?organization_id=org-1',
      { organization_id: 'org-1', hidden: true }))
  })

  it('brings a hidden built-in back', async () => {
    api.patch.mockResolvedValue({ data: { success: true } })
    render(<FormBuilder orgId="org-1" />)
    await open()
    const row = (await screen.findByText('Injury report')).closest('li')
    fireEvent.click(within(row).getByRole('button', { name: 'Show' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      expect.stringContaining('/builtin/injury'),
      { organization_id: 'org-1', hidden: false }))
  })

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
    fireEvent.change(screen.getByLabelText('Question 1'), { target: { value: 'What do you need?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save form' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/staff-admin/form-templates',
      expect.objectContaining({
        name: 'Supply request',
        fields: [expect.objectContaining({ label: 'What do you need?' })],
      }),
    ))
  })

  // iCreate, 2026-09-22. Three tickets, one cause: the question box and the
  // type picker shared a flex row with four buttons and no min-w-0, so the
  // box drew as a sliver ("there's a tiny field before the field where you
  // pick the type", 1662c5fb). People typed the question into the hint box
  // instead, and save() quietly dropped every row whose label was blank --
  // four questions saving as nothing with "Add at least one question"
  // (cc5edc5c), three saving as one (b7167bc6).
  describe('a question with no wording', () => {
    const newFormWithQuestions = async (n) => {
      render(<FormBuilder orgId="org-1" />)
      fireEvent.click(await screen.findByRole('button', { name: '+ New form' }))
      fireEvent.change(screen.getByLabelText('Form name'), { target: { value: 'Training Completion' } })
      for (let i = 1; i < n; i += 1) {
        fireEvent.click(screen.getByRole('button', { name: '+ Add question' }))
      }
    }

    it('is refused by name instead of being thrown away', async () => {
      await newFormWithQuestions(3)
      fireEvent.change(screen.getByLabelText('Question 1'), { target: { value: 'Which training?' } })
      // Questions 2 and 3 are left blank.
      fireEvent.click(screen.getByRole('button', { name: 'Save form' }))
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Question 2')))
      expect(api.post).not.toHaveBeenCalled()
    })

    it('does not save the form as one question', async () => {
      await newFormWithQuestions(3)
      fireEvent.change(screen.getByLabelText('Question 1'), { target: { value: 'Which training?' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save form' }))
      await waitFor(() => expect(toast.error).toHaveBeenCalled())
      expect(api.post).not.toHaveBeenCalled()
    })

    it('saves all three once each is worded', async () => {
      await newFormWithQuestions(3)
      fireEvent.change(screen.getByLabelText('Question 1'), { target: { value: 'Which training?' } })
      fireEvent.change(screen.getByLabelText('Question 2'), { target: { value: 'When did you watch it?' } })
      fireEvent.change(screen.getByLabelText('Question 3'), { target: { value: 'Anything unclear?' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save form' }))
      await waitFor(() => expect(api.post).toHaveBeenCalled())
      expect(api.post.mock.calls[0][1].fields).toHaveLength(3)
    })

    // The hint is not the question. Molly's one saved field was
    // label "Slkjf;aeoijwef", help "Name of Training".
    it('a hint alone does not stand in for the question', async () => {
      await newFormWithQuestions(1)
      fireEvent.change(screen.getByPlaceholderText('Hint shown under the question (optional)'),
        { target: { value: 'Name of Training' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save form' }))
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Question 1')))
      expect(api.post).not.toHaveBeenCalled()
    })
  })

  // 8b5f114f: the audience words named the audience but never said what
  // followed from it.
  it('says where each audience finds the form', async () => {
    render(<FormBuilder orgId="org-1" />)
    fireEvent.click(await screen.findByRole('button', { name: '+ New form' }))
    expect(screen.getByText(/Teachers and office staff find it under Forms/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Who fills this in'), { target: { value: 'family' } })
    expect(screen.getByText(/Parents find it under Forms in their Optio account/)).toBeInTheDocument()
  })

  // 5012eff5: every built-in draws the same three boxes, so saying so is the
  // whole answer to "idk what the built-in forms look like".
  it('says what the built-in forms ask', async () => {
    render(<FormBuilder orgId="org-1" />)
    await open()
    expect(await screen.findByText(/they all ask the same three things/)).toBeInTheDocument()
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
