import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import PasswordStrengthMeter from '../components/auth/PasswordStrengthMeter'
import api from '../services/api'

/**
 * StaffWelcomePage — where a teacher lands from the account-setup invite email
 * (sent when an org admin adds them on the SIS Staff page or links a
 * placeholder account). Explains what the account is, then sets the password
 * through the same token endpoint as password reset, which also confirms the
 * email address. One link, one step, ready to log in.
 */
const StaffWelcomePage = () => {
  const { register, handleSubmit, watch, formState: { errors } } = useForm()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Server-resolved invite details (org name, logo, email). The query params
  // are only a first-paint fallback; the token is the source of truth.
  const [invite, setInvite] = useState(null)

  const token = useMemo(() => searchParams.get('token') || '', [searchParams])
  const email = invite?.email || searchParams.get('email') || ''
  // Default true: an admin adding a teacher supplies only their email, so the
  // name fields show unless the server says the account already has one.
  const needsProfile = invite ? invite.needs_profile !== false : true
  const orgName = invite?.org_name || searchParams.get('org') || 'your school'
  const logoUrl = invite?.logo_url || null

  useEffect(() => {
    if (!token) return
    api.get(`/api/auth/staff-invite/${token}`)
      .then((r) => setInvite(r.data || {}))
      .catch((err) => {
        if (err?.response?.status === 410) {
          setErrorMessage('This invite link has expired.')
        }
        // 404 (unknown/used token) surfaces when they submit; the page still
        // renders with the query-param fallbacks.
      })
  }, [token])

  const password = watch('password', '')
  const confirmPassword = watch('confirmPassword', '')
  const passwordsMatch = password && confirmPassword && password === confirmPassword

  const onSubmit = async (data) => {
    if (data.password !== data.confirmPassword) {
      setErrorMessage('Passwords do not match')
      return
    }
    setLoading(true)
    setErrorMessage('')
    try {
      await api.post('/api/auth/reset-password', {
        token,
        new_password: data.password,
        // Admins invite staff by email alone, so the teacher names themselves
        // here. The backend ignores these for an account that already has a
        // name, so a returning user can't be renamed by this form.
        first_name: (data.first_name || '').trim(),
        last_name: (data.last_name || '').trim(),
        bio: (data.bio || '').trim(),
      })
      toast.success('Your account is ready. Log in with your new password.')
      navigate('/login')
    } catch (error) {
      setErrorMessage(
        error.response?.data?.error ||
        'Something went wrong setting your password. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={`${orgName} logo`}
              className="mx-auto h-16 w-auto object-contain"
            />
          )}
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Welcome to {orgName} on Optio
          </h2>
          <p className="mt-3 text-sm text-gray-600">
            {orgName} uses Optio to manage classes, rosters, attendance, and
            messaging. A teacher account has been created for you
            {needsProfile
              ? ' — tell us your name and choose a password to finish setting it up.'
              : '. Choose a password below to finish setting it up.'}
          </p>
          {email && (
            <p className="mt-2 text-sm text-gray-600">
              You&apos;ll sign in as <span className="font-medium text-gray-900">{email}</span>
            </p>
          )}
        </div>

        {!token && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-800">
              This setup link is missing its code. Open the link from your
              invite email again, or ask {orgName} to resend the invite.
            </p>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-800">{errorMessage}</p>
            {(errorMessage.includes('expired') || errorMessage.includes('used')) && (
              <p className="mt-2 text-sm text-red-800">
                Ask {orgName} to resend your invite, or use{' '}
                <Link to="/forgot-password" className="font-medium underline">
                  Forgot password
                </Link>{' '}
                with your email address.
              </p>
            )}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="rounded-md shadow-sm space-y-4">
            {/* The school only had your email — tell us who you are. Skipped for
                accounts that already have a name (e.g. a claimed placeholder). */}
            {needsProfile && (
            <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
                  First name
                </label>
                <input
                  {...register('first_name', { required: 'Please enter your first name' })}
                  id="first_name"
                  type="text"
                  autoComplete="given-name"
                  className="input-field rounded-lg"
                  placeholder="Jane"
                />
                {errors.first_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Last name
                </label>
                <input
                  {...register('last_name', { required: 'Please enter your last name' })}
                  id="last_name"
                  type="text"
                  autoComplete="family-name"
                  className="input-field rounded-lg"
                  placeholder="Doe"
                />
                {errors.last_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
                A little about you <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                {...register('bio')}
                id="bio"
                rows={3}
                className="input-field rounded-lg resize-none"
                placeholder="A short introduction families will see — what you teach, and anything you'd like them to know."
              />
            </div>
            </>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Choose a password
              </label>
              <div className="relative">
                <input
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: 12,
                      message: 'Password must be at least 12 characters'
                    }
                  })}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="input-field rounded-lg pr-10"
                  placeholder="At least 12 characters"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm text-gray-500"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
              <PasswordStrengthMeter password={password} />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm password
              </label>
              <input
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (value) => value === password || 'Passwords do not match'
                })}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className="input-field rounded-lg"
                placeholder="Re-enter your password"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
              )}
              {confirmPassword && (
                <p className={`mt-2 text-sm ${passwordsMatch ? 'text-green-700' : 'text-red-700'}`}>
                  {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                </p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Setting up your account…' : 'Set password and finish'}
          </button>

          <div className="text-sm text-center">
            <span className="text-gray-600">Already set up? </span>
            <Link to="/login" className="font-medium text-primary hover:text-purple-500">
              Log in
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default StaffWelcomePage
