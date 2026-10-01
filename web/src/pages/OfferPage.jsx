import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { queryKeys } from '../utils/queryKeys'
import { clearPendingOffer, getPendingOffer, setPendingOffer } from '../utils/pendingOffer'

/**
 * /offer/:slug -- the link a credit-class partner gives its buyers.
 *
 * Signed out: what the class is, and a way to sign up or sign in. The slug is
 * saved first, so after signing up (which may detour through email
 * verification or Google) PendingOfferRedirect brings them back here.
 * Signed in: the class is added to the student's own account
 * (POST /api/offers/:slug/claim), automatically when they arrived through the
 * saved slug, and on a button press otherwise. Claiming twice is harmless.
 */
export default function OfferPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, user, loading: authLoading } = useAuth()
  const [claiming, setClaiming] = useState(false)
  const [problem, setProblem] = useState(null) // { code, message }
  const [dob, setDob] = useState('')
  const autoTried = useRef(false)

  const { data: offer, isLoading, isError } = useQuery({
    queryKey: queryKeys.offer(slug),
    queryFn: async () => (await api.get(`/api/offers/${encodeURIComponent(slug)}`)).data.offer,
    retry: false,
  })

  const claim = async (dateOfBirth) => {
    setClaiming(true)
    setProblem(null)
    try {
      await api.post(`/api/offers/${encodeURIComponent(slug)}/claim`,
        dateOfBirth ? { date_of_birth: dateOfBirth } : {})
      clearPendingOffer()
      toast.success(`${offer?.title || 'The class'} is in your classes`)
      navigate('/my-classes', { replace: true })
    } catch (err) {
      const data = err.response?.data || {}
      // A birthday we can ask for keeps the link pending; anything else is final.
      if (data.code !== 'dob_required') clearPendingOffer()
      setProblem({ code: data.code, message: data.error || 'Could not add the class. Please try again.' })
    } finally {
      setClaiming(false)
    }
  }

  useEffect(() => {
    if (autoTried.current || authLoading || !isAuthenticated || !user || !offer) return
    if (getPendingOffer() !== slug) return
    autoTried.current = true
    claim()
  }, [authLoading, isAuthenticated, user, offer, slug])

  const goTo = (path) => {
    setPendingOffer(slug)
    navigate(path)
  }

  if (isLoading || authLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>
  }

  if (isError || !offer) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900">This class link is not available</h1>
        <p className="mt-2 text-gray-600">Check the link with the person who sent it to you.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {offer.image_url && (
          <img src={offer.image_url} alt="" className="w-full h-48 object-cover" />
        )}
        <div className="p-6 space-y-4">
          <div>
            {offer.partner_name && (
              <p className="text-sm font-medium text-optio-purple">From {offer.partner_name}</p>
            )}
            <h1 className="text-2xl font-bold text-gray-900">{offer.title}</h1>
            <p className="mt-1 text-sm text-gray-600">
              Half a credit of {offer.subject_name} on an accredited high school transcript.
              For students {offer.min_age} and older.
            </p>
          </div>

          {offer.description && (
            <p className="text-gray-700 whitespace-pre-line">{offer.description}</p>
          )}

          {problem && (
            <div role="alert" className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
              {problem.message}
            </div>
          )}

          {!isAuthenticated ? (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-gray-600">
                Create a student account to get the class. If you already have one, sign in.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => goTo('/register')}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gradient-primary rounded-lg hover:opacity-90"
                >
                  Create an account
                </button>
                <button
                  onClick={() => goTo('/login')}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Sign in
                </button>
              </div>
            </div>
          ) : problem?.code === 'dob_required' ? (
            <form
              className="space-y-3 pt-2"
              onSubmit={(e) => { e.preventDefault(); if (dob) claim(dob) }}
            >
              <label htmlFor="offer-dob" className="block text-sm font-medium text-gray-700">
                Your date of birth
              </label>
              <input
                id="offer-dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="block w-full rounded-lg border-gray-300 focus:border-optio-purple focus:ring-optio-purple"
                required
              />
              <button
                type="submit"
                disabled={claiming || !dob}
                className="w-full px-4 py-2.5 text-sm font-medium text-white bg-gradient-primary rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {claiming ? 'Adding...' : 'Add the class'}
              </button>
            </form>
          ) : problem?.code ? null : (
            // A refusal with a code (under age, not a student) is final; one
            // without (a network error) can be retried.
            <button
              onClick={() => claim()}
              disabled={claiming}
              className="w-full px-4 py-2.5 text-sm font-medium text-white bg-gradient-primary rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {claiming ? 'Adding...' : 'Add this class to my account'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
