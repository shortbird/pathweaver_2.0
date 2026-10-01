import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from '../services/api'
import OfferPage from './OfferPage'

/**
 * /offer/:slug, the link a credit-class partner gives its buyers.
 *
 * Signed out, the page saves the slug before sending the visitor to sign up,
 * because signing up can leave the app (email verification, Google) and the
 * visitor must still end up with the class. Signed in and arriving through
 * that saved slug, the class is claimed without another click. A missing
 * birthday is asked for on the page; an under-age or non-student refusal is
 * final and clears the saved slug, so the redirect cannot loop.
 */

const auth = { isAuthenticated: false, user: null, loading: false }
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('react-hot-toast', () => {
  const toast = { success: vi.fn(), error: vi.fn() }
  return { default: toast, toast }
})


const OFFER = {
  slug: 'latticework', title: 'Critical Thinking: The Latticework', description: 'Build it.',
  subject_name: 'Language Arts', partner_name: 'Raleigh Williams', min_age: 13, image_url: null,
}

const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/offer/latticework']}>
        <Routes>
          <Route path="/offer/:slug" element={<OfferPage />} />
          <Route path="/register" element={<div>register page</div>} />
          <Route path="/my-classes" element={<div>my classes page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('OfferPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    Object.assign(auth, { isAuthenticated: false, user: null })
    api.get.mockResolvedValue({ data: { offer: OFFER } })
  })

  it('signed out: shows the class and saves the link before sending them to sign up', async () => {
    mount()
    expect(await screen.findByText(OFFER.title)).toBeInTheDocument()
    expect(screen.getByText(/half a credit of language arts/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    expect(screen.getByText('register page')).toBeInTheDocument()
    expect(localStorage.getItem('optioPendingOffer')).toBe('latticework')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('signed in through the saved link: claims the class without another click', async () => {
    Object.assign(auth, { isAuthenticated: true, user: { id: 'u1' } })
    localStorage.setItem('optioPendingOffer', 'latticework')
    api.post.mockResolvedValue({ data: { created: true } })
    mount()
    expect(await screen.findByText('my classes page')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/api/offers/latticework/claim', {})
    expect(localStorage.getItem('optioPendingOffer')).toBeNull()
  })

  it('signed in without the saved link: waits for the button', async () => {
    Object.assign(auth, { isAuthenticated: true, user: { id: 'u1' } })
    api.post.mockResolvedValue({ data: { created: true } })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Add this class to my account' }))
    expect(await screen.findByText('my classes page')).toBeInTheDocument()
  })

  it('asks for a missing birthday, then sends it', async () => {
    Object.assign(auth, { isAuthenticated: true, user: { id: 'u1' } })
    api.post
      .mockRejectedValueOnce({ response: { data: { code: 'dob_required', error: 'We need your date of birth.' } } })
      .mockResolvedValueOnce({ data: { created: true } })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Add this class to my account' }))
    const dob = await screen.findByLabelText('Your date of birth')
    await userEvent.type(dob, '2010-03-04')
    await userEvent.click(screen.getByRole('button', { name: 'Add the class' }))
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith(
      '/api/offers/latticework/claim', { date_of_birth: '2010-03-04' }))
  })

  it('an under-age refusal is final and clears the saved link', async () => {
    Object.assign(auth, { isAuthenticated: true, user: { id: 'u1' } })
    localStorage.setItem('optioPendingOffer', 'latticework')
    api.post.mockRejectedValue({ response: { data: { code: 'under_age', error: 'Credit classes are for students 13 and older.' } } })
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('13 and older')
    expect(screen.queryByRole('button', { name: 'Add this class to my account' })).not.toBeInTheDocument()
    expect(localStorage.getItem('optioPendingOffer')).toBeNull()
  })

  it('an unknown link says so', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } })
    mount()
    expect(await screen.findByText('This class link is not available')).toBeInTheDocument()
  })
})
