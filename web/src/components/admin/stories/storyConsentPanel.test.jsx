/**
 * The consent chip and its record form.
 *
 * These ran through the grader's story panel until 2026-09-15, when that
 * panel shrank to one bookmark button and stopped rendering consent at all.
 * The editor still does, and the chip is the reader's only warning about
 * which tier the story publishes in, so the tests moved here.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import api from '../../../services/api'
import StoryConsentPanel from './StoryConsentPanel'
import { withConfirm } from '../../../tests/confirmTestUtils'

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const ON_FILE = {
  id: 'c1', active: true, source: 'academy_agreement', granted_at: '2026-09-01T00:00:00Z',
  scope: { work: true, first_name: true, image_voice: false, age: false },
}

/**
 * Drives the panel the way its owners do: the parent holds the consent and
 * hands back whatever the form records.
 */
const Host = ({ consent: initial = null }) => {
  const [consent, setConsent] = React.useState(initial)
  return <StoryConsentPanel studentUserId="stu1" consent={consent} onChange={setConsent} />
}

beforeEach(() => {
  vi.clearAllMocks()
  api.post.mockImplementation(async (url) => {
    if (url === '/api/admin/stories/consents') {
      return { data: { success: true, consent: {
        id: 'c1', active: true, scope: { work: true, first_name: true, image_voice: false, age: false },
        source: 'written', granted_at: '2026-09-11T00:00:00Z',
      } } }
    }
    return { data: { data: {} } }
  })
})

describe('consent', () => {
  it('lists the granted scopes when consent is on file', () => {
    render(withConfirm(<Host consent={ON_FILE} />))
    expect(screen.getByText('Consent on file: student work, first name')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record consent' })).toBeNull()
  })

  it('says the story publishes anonymized when there is none, and records one inline', async () => {
    render(withConfirm(<Host />))
    expect(screen.getByText('No consent recorded. The story publishes anonymized.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Record consent' }))
    const form = screen.getByRole('form', { name: 'Record consent' })
    fireEvent.click(within(form).getByLabelText('First name'))
    fireEvent.change(within(form).getByLabelText('Source reference'), { target: { value: 'Email 2026-09-10' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save consent' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/admin/stories/consents', expect.objectContaining({
      student_user_id: 'stu1',
      scope: { work: true, first_name: true, image_voice: false, age: false },
      source: 'written',
      source_ref: 'Email 2026-09-10',
    })))
    await screen.findByText('Consent on file: student work, first name')
  })

  it('will not record consent without a source reference', () => {
    render(withConfirm(<Host />))
    fireEvent.click(screen.getByRole('button', { name: 'Record consent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save consent' }))
    expect(api.post).not.toHaveBeenCalled()
  })
})
