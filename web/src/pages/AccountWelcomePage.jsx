import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import PasswordStrengthMeter from '../components/auth/PasswordStrengthMeter'
import GoogleButton from '../components/auth/GoogleButton'
import AppleButton from '../components/auth/AppleButton'
import api from '../services/api'

/**
 * AccountWelcomePage — where someone lands from the "Your Optio account is
 * ready" email, sent when a superadmin creates their account from
 * /admin/users (services/account_invite_service.py).
 *
 * The account and its role already exist, so this page only picks how they
 * sign in. Google and Apple find the account by email and sign into it, which
 * is why the copy insists on the invited address — a different Google account
 * would make a separate, empty student account. A password goes through the
 * same token endpoint as every other invite.
 */
const AccountWelcomePage = () => {
  const { register, handleSubmit, watch, formState: { errors } } = useForm()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  // Server-resolved invite details. The query params are only a first-paint
  // fallback; the token is the source of truth.
  const [invite, setInvite] = useState(null)

  const token = useMemo(() => searchParams.get('token') || '', [searchParams])
  const email = invite?.email || searchParams.get('email') || ''
  const needsProfile = invite ? invite.needs_profile !== false : true
  const orgName = invite?.org_name || ''

  useEffect(() => {
    if (!token) return
    api.get(`/api/auth/invite-info/${token}`)
      .then((r) => setInvite(r.data || {}))
      .catch((err) => {
        if (err?.response?.status === 410) {
          setErrorMessage('This setup link has expired.')
        }
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
        // The backend ignores these for an account that already has a name.
        first_name: (data.first_name || '').trim(),
        last_name: (data.last_name || '').trim(),
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
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Welcome to Optio
          </h2>
          <p className="mt-3 text-sm text-gray-600">
            Your account{orgName ? ` with ${orgName}` : ''} is ready. Choose how
            you want to sign in.
          </p>
          {email && (
            <p className="mt-2 text-sm text-gray-600">
              Your account email is <span className="font-medium text-gray-900">{email}</span>
            </p>
          )}
        </div>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-800">{errorMessage}</p>
            {(errorMessage.includes('expired') || errorMessage.includes('used')) && (
              <p className="mt-2 text-sm text-red-800">
                You can still sign in with Google or Apple below, or use{' '}
                <Link to="/forgot-password" className="font-medium underline">
                  Forgot password
                </Link>{' '}
                with your email address.
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          <GoogleButton onError={setErrorMessage} />
          <AppleButton onError={setErrorMessage} />
          <p className="text-xs text-gray-500 text-center">
            Use the Google or Apple account for {email || 'the email this invite was sent to'}.
            With Apple, choose <span className="font-medium">Share My Email</span>.
            A different email makes a separate account.
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-neutral-50 text-gray-500">or</span>
          </div>
        </div>

        {!showPasswordForm ? (
          <button
            type="button"
            onClick={() => setShowPasswordForm(true)}
            disabled={!token}
            className="w-full btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Choose a password
          </button>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4">
              {needsProfile && (
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
                    />
                    {errors.last_name && (
                      <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Choose a password
                </label>
                <div className="relative">
                  <input
                    {...register('password', {
                      required: 'Password is required',
                      minLength: { value: 12, message: 'Password must be at least 12 characters' }
                    })}
                    id="password"
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
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="input-field rounded-lg"
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
          </form>
        )}

        <div className="text-sm text-center">
          <span className="text-gray-600">Already set up? </span>
          <Link to="/login" className="font-medium text-primary hover:text-optio-purple">
            Log in
          </Link>
        </div>
      </div>
    </div>
  )
}

export default AccountWelcomePage
