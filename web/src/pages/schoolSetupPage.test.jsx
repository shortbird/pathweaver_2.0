import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from '../services/api'
import SchoolSetupPage from './SchoolSetupPage'

// Text fields are filled with fireEvent.change, not userEvent.type: this page
// renders a long form, and typing it key by key timed the test out under CI
// coverage (release 37370947002, 2026-10-05).

/**
 * /start-school/:token, the link Optio sends a new school's operator.
 *
 * Signed out, the page saves the token before sending the visitor to sign up,
 * because signing up can leave the app and the operator must come back to the
 * form. Signed in, the required answers are checked before anything is sent,
 * and a submit creates the school and clears the saved token. A closed link
 * clears it too, so the redirect cannot loop.
 */

const auth = { isAuthenticated: false, user: null, loading: false, logout: vi.fn() }
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('react-hot-toast', () => {
  const toast = { success: vi.fn(), error: vi.fn() }
  return { default: toast, toast }
})

const KEY = 'optioPendingSchoolSetup'
let phone
let link

const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/start-school/tok123']}>
        <Routes>
          <Route path="/start-school/:token" element={<SchoolSetupPage />} />
          <Route path="/register" element={<div>register page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SchoolSetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    window.scrollTo = vi.fn()
    Element.prototype.scrollIntoView = vi.fn()
    Object.assign(auth, { isAuthenticated: false, user: null })
    phone = { verified: true, phone: '••• ••• 0123' }
    link = { status: 'open', school_name_hint: 'Juniper Ridge' }
    api.get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/api/phone-verification') ? phone : { link },
    }))
  })

  it('signed out: saves the link before sending them to sign up', async () => {
    mount()
    expect(await screen.findByText('Set up Juniper Ridge on Optio')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    expect(screen.getByText('register page')).toBeInTheDocument()
    expect(localStorage.getItem(KEY)).toBe('tok123')
  })

  it('signed in: a missing required answer stops the submit', async () => {
    Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', email: 'pat@school.org' } })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Create my school' }))
    expect(screen.getByText('Enter your role.')).toBeInTheDocument()
    expect(screen.getByText('Enter how many students you have in at least one grade.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('signed in: an unverified phone shows the text-code step and blocks the submit', async () => {
    Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', email: 'pat@school.org' } })
    phone = { verified: false, phone: null, prefill: '+18015550123' }
    api.post.mockResolvedValue({ data: { success: true, phone: '••• ••• 0123' } })
    mount()
    expect(await screen.findByLabelText(/text you a code/)).toHaveValue('+18015550123')
    await userEvent.click(screen.getByRole('button', { name: 'Create my school' }))
    expect(screen.getByText('Verify your phone number.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Text me a code' }))
    expect(api.post).toHaveBeenCalledWith('/api/phone-verification/send-code', { phone: '+18015550123' })
    fireEvent.change(await screen.findByLabelText(/Enter the code/), { target: { value: '123456' } })
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }))
    expect(api.post).toHaveBeenCalledWith('/api/phone-verification/verify', { code: '123456' })
    expect(await screen.findByText('Verified')).toBeInTheDocument()
  })

  it('signed in: the required answers create the school and clear the saved link', async () => {
    Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', email: 'pat@school.org' } })
    localStorage.setItem(KEY, 'tok123')
    api.post.mockResolvedValue({ data: { organization_id: 'o1', slug: 'juniper-ridge', name: 'Juniper Ridge' } })
    mount()

    expect(await screen.findByLabelText(/School name/)).toHaveValue('Juniper Ridge')
    fireEvent.change(screen.getByLabelText(/Your role at the school/), { target: { value: 'Founder' } })
    fireEvent.change(screen.getByLabelText(/^City/), { target: { value: 'Provo' } })
    fireEvent.change(screen.getByLabelText(/State or region/), { target: { value: 'UT' } })
    fireEvent.change(screen.getByLabelText('Students in grade 4'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Students in K'), { target: { value: '5' } })
    expect(screen.getByText('11')).toBeInTheDocument()   // the running total
    fireEvent.change(screen.getByLabelText('Do you collect tuition through Optio?'), { target: { value: 'yes' } })
    fireEvent.change(screen.getByLabelText('Do families register through Optio?'), { target: { value: 'no' } })
    await userEvent.click(screen.getByLabelText(/Attendance/))
    await userEvent.click(screen.getByRole('button', { name: 'Create my school' }))

    expect(await screen.findByText('Juniper Ridge is on Optio')).toBeInTheDocument()
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/school-setup/tok123')
    expect(body).toMatchObject({
      school_name: 'Juniper Ridge', contact_title: 'Founder', city: 'Provo', region: 'UT',
      grade_counts: { 4: 6, K: 5 }, features: ['attendance'],
      collects_tuition: 'yes', families_register: 'no', ai_choice: 'on', library_choice: 'all_optio',
    })
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('a used link says so and forgets the saved token', async () => {
    localStorage.setItem(KEY, 'tok123')
    link = { status: 'used', school_name_hint: null }
    mount()
    expect(await screen.findByText('This setup link is not available')).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull())
  })

  it('an account already in a school cannot submit', async () => {
    Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', email: 'a@b.org', organization_id: 'o9' } })
    mount()
    expect(await screen.findByRole('button', { name: 'Create my school' })).toBeDisabled()
  })
})
