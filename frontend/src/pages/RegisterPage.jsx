import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import PasswordStrengthMeter from '../components/auth/PasswordStrengthMeter'
import GoogleButton from '../components/auth/GoogleButton'
import logger from '../utils/logger'
import api from '../services/api'
import toast from 'react-hot-toast'

const RegisterPage = () => {
  const { register: registerField, handleSubmit, formState: { errors }, watch, setValue } = useForm()
  const { register, isAuthenticated, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const invitationCode = searchParams.get('invitation')
  const promoCodeFromUrl = searchParams.get('promo')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isUnder13, setIsUnder13] = useState(false)
  const [googleError, setGoogleError] = useState('')
  const [promoCodeStatus, setPromoCodeStatus] = useState({ valid: null, reason: null, loading: false })
  const password = watch('password')
  const dateOfBirth = watch('date_of_birth')
  const promoCode = watch('promo_code')

  // Check if this is an observer registration
  const isObserverRegistration = !!invitationCode

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user && !authLoading) {
      logger.debug('[RegisterPage] User already authenticated, redirecting')
      // If there's an invitation code, redirect to accept it
      if (invitationCode) {
        navigate(`/observer/accept/${invitationCode}`, { replace: true })
      } else {
        const redirectPath = user.role === 'parent' ? '/parent/dashboard'
          : user.role === 'observer' ? '/observer/feed'
          : '/dashboard'
        navigate(redirectPath, { replace: true })
      }
    }
  }, [isAuthenticated, user, authLoading, navigate, invitationCode])

  // Enhanced password validation matching backend requirements
  const validatePasswordStrength = (pwd) => {
    if (!pwd) return { isValid: false, errors: [] }

    const errors = []
    if (pwd.length < 12) errors.push('At least 12 characters')
    if (!/[A-Z]/.test(pwd)) errors.push('One uppercase letter')
    if (!/[a-z]/.test(pwd)) errors.push('One lowercase letter')
    if (!/[0-9]/.test(pwd)) errors.push('One number')
    if (!/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(pwd)) errors.push('One special character')

    return { isValid: errors.length === 0, errors }
  }

  const passwordStrength = validatePasswordStrength(password)
  const isPasswordValid = passwordStrength.isValid

  // Check age when date of birth changes
  React.useEffect(() => {
    if (dateOfBirth) {
      const dob = new Date(dateOfBirth)
      const today = new Date()
      const age = Math.floor((today - dob) / (365.25 * 24 * 60 * 60 * 1000))
      setIsUnder13(age < 13)
    } else {
      setIsUnder13(false)
    }
  }, [dateOfBirth])

  // Pre-fill promo code from URL
  React.useEffect(() => {
    if (promoCodeFromUrl) {
      setValue('promo_code', promoCodeFromUrl)
    }
  }, [promoCodeFromUrl, setValue])

  // Validate promo code with debounce
  React.useEffect(() => {
    if (!promoCode || promoCode.length < 5) {
      setPromoCodeStatus({ valid: null, reason: null, loading: false })
      return
    }

    const timeoutId = setTimeout(async () => {
      setPromoCodeStatus({ valid: null, reason: null, loading: true })
      try {
        const response = await api.post('/api/promo/validate-code', { code: promoCode })
        setPromoCodeStatus({
          valid: response.data.valid,
          reason: response.data.reason || null,
          loading: false
        })
      } catch (err) {
        setPromoCodeStatus({ valid: false, reason: 'error', loading: false })
      }
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [promoCode])

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      // Build registration data with optional codes
      let registrationData = { ...data }

      // Pass invitation code if this is an observer registration
      if (invitationCode) {
        registrationData.invitation_code = invitationCode
        // Store invitation code so we can redirect after email verification
        localStorage.setItem('pendingObserverInvitation', invitationCode)
      }

      // Include promo code if valid
      if (data.promo_code && promoCodeStatus.valid) {
        registrationData.promo_code = data.promo_code
      }

      // Let the normal registration flow handle email verification redirect
      await register(registrationData)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          {isObserverRegistration && (
            <div className="mb-4 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg p-4 text-center">
              <p className="font-semibold">Creating Observer Account</p>
              <p className="text-sm text-purple-100">You'll be able to follow a student's learning journey</p>
            </div>
          )}
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            {isObserverRegistration ? 'Create your observer account' : 'Create your account'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link to={invitationCode ? `/login?invitation=${invitationCode}` : '/login'} className="font-medium text-primary hover:text-purple-500">
              sign in to your existing account
            </Link>
          </p>
        </div>

        {/* Google Sign-up Option */}
        <div className="mt-6">
          {googleError && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 rounded-md p-4">
              <p className="text-sm text-red-800">{googleError}</p>
            </div>
          )}
          <GoogleButton
            mode="signup"
            onError={(error) => setGoogleError(error)}
            disabled={loading}
            promoCode={promoCodeStatus.valid ? promoCode : null}
          />
          {promoCodeStatus.valid && (
            <p className="mt-2 text-sm text-center text-green-600">
              Your promo code will be applied when you sign up with Google
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-background text-gray-500">Or register with email</span>
          </div>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">
                  First Name
                </label>
                <input
                  id="first_name"
                  {...registerField('first_name', {
                    required: 'First name is required'
                  })}
                  type="text"
                  className="input-field mt-1"
                  placeholder="John"
                  aria-invalid={!!errors.first_name}
                  aria-describedby={errors.first_name ? "first-name-error" : undefined}
                />
                {errors.first_name && (
                  <p id="first-name-error" role="alert" className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">
                  Last Name
                </label>
                <input
                  id="last_name"
                  {...registerField('last_name', {
                    required: 'Last name is required'
                  })}
                  type="text"
                  className="input-field mt-1"
                  placeholder="Doe"
                  aria-invalid={!!errors.last_name}
                  aria-describedby={errors.last_name ? "last-name-error" : undefined}
                />
                {errors.last_name && (
                  <p id="last-name-error" role="alert" className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                id="email"
                {...registerField('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address'
                  }
                })}
                type="email"
                className="input-field mt-1"
                placeholder="john@example.com"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
              />
              {errors.email && (
                <p id="email-error" role="alert" className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700">
                Date of Birth
              </label>
              <input
                id="date_of_birth"
                {...registerField('date_of_birth', {
                  required: 'Date of birth is required for age verification'
                })}
                type="date"
                className="input-field mt-1"
                max={new Date().toISOString().split('T')[0]}
                aria-invalid={!!errors.date_of_birth}
                aria-describedby={errors.date_of_birth ? "date-of-birth-error" : undefined}
              />
              {errors.date_of_birth && (
                <p id="date-of-birth-error" role="alert" className="mt-1 text-sm text-red-600">{errors.date_of_birth.message}</p>
              )}
              {isUnder13 && (
                <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start">
                    <svg className="h-5 w-5 text-amber-500 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <h4 className="text-sm font-medium text-amber-800">
                        Parent Account Required
                      </h4>
                      <p className="mt-1 text-sm text-amber-700">
                        Users under 13 cannot create their own account. A parent or guardian must create an account first, then add you as a child profile from their dashboard.
                      </p>
                      <Link
                        to="/register"
                        className="mt-2 inline-flex items-center text-sm font-medium text-amber-800 hover:text-amber-900"
                        onClick={() => {
                          // Clear date of birth to allow parent to register
                          const dobInput = document.getElementById('date_of_birth')
                          if (dobInput) dobInput.value = ''
                          setIsUnder13(false)
                        }}
                      >
                        I am a parent/guardian registering an account
                        <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Promo Code Field */}
            <div>
              <label htmlFor="promo_code" className="block text-sm font-medium text-gray-700">
                Promo Code <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="relative mt-1">
                <input
                  id="promo_code"
                  {...registerField('promo_code')}
                  type="text"
                  className="input-field pr-10 uppercase"
                  placeholder="OPTIO-XXXX-XXXX"
                  aria-describedby="promo-code-status"
                  style={{ textTransform: 'uppercase' }}
                />
                {promoCodeStatus.loading && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                )}
                {!promoCodeStatus.loading && promoCodeStatus.valid === true && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {!promoCodeStatus.loading && promoCodeStatus.valid === false && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
              </div>
              {promoCodeStatus.valid === true && (
                <p id="promo-code-status" className="mt-1 text-sm text-green-600 flex items-center gap-1">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                  First month free! Your account will be created as a Parent account.
                </p>
              )}
              {promoCodeStatus.valid === false && promoCodeStatus.reason === 'expired' && (
                <p id="promo-code-status" className="mt-1 text-sm text-red-600">
                  This promo code has expired.
                </p>
              )}
              {promoCodeStatus.valid === false && promoCodeStatus.reason === 'already_used' && (
                <p id="promo-code-status" className="mt-1 text-sm text-red-600">
                  This promo code has already been used.
                </p>
              )}
              {promoCodeStatus.valid === false && promoCodeStatus.reason === 'not_found' && (
                <p id="promo-code-status" className="mt-1 text-sm text-red-600">
                  Invalid promo code.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="relative mt-1">
                <input
                  id="password"
                  {...registerField('password', {
                    required: 'Password is required',
                    minLength: {
                      value: 12,
                      message: 'Password must be at least 12 characters'
                    },
                    validate: (value) => {
                      const { isValid, errors } = validatePasswordStrength(value)
                      return isValid || `Password must contain: ${errors.join(', ')}`
                    }
                  })}
                  type={showPassword ? "text" : "password"}
                  className="input-field pr-10"
                  placeholder="••••••••"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "password-error" : undefined}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Password strength meter - Enhanced Phase 1 Security Fix */}
              <PasswordStrengthMeter password={password} />

              <p className="mt-1 text-xs text-gray-500">
                Password must be at least 12 characters with uppercase, lowercase, number, and special character
              </p>
              {errors.password && (
                <p id="password-error" role="alert" className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>
            
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <div className="relative mt-1">
                <input
                  id="confirmPassword"
                  {...registerField('confirmPassword', {
                    required: 'Please confirm your password',
                    validate: value => value === password || 'Passwords do not match'
                  })}
                  type={showConfirmPassword ? "text" : "password"}
                  className="input-field pr-10"
                  placeholder="••••••••"
                  aria-invalid={!!errors.confirmPassword}
                  aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? (
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p id="confirm-password-error" role="alert" className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
              )}
            </div>
          </div>

          {/* Combined Terms of Service and Privacy Policy checkbox */}
          <div className="space-y-3">
            <div className="flex items-start">
              <input
                {...registerField('acceptedLegalTerms', {
                  required: 'You must accept the Terms of Service and Privacy Policy'
                })}
                type="checkbox"
                id="acceptedLegalTerms"
                className="mt-1 h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                aria-invalid={!!errors.acceptedLegalTerms}
                aria-describedby={errors.acceptedLegalTerms ? "legal-terms-error" : undefined}
              />
              <label htmlFor="acceptedLegalTerms" className="ml-2 text-sm text-gray-700">
                I agree to the{' '}
                <Link to="/terms" target="_blank" className="text-primary hover:text-optio-purple underline">
                  Terms of Service
                </Link>
                {' '}and{' '}
                <Link to="/privacy" target="_blank" className="text-primary hover:text-optio-purple underline">
                  Privacy Policy
                </Link>
              </label>
            </div>
            {errors.acceptedLegalTerms && (
              <p id="legal-terms-error" role="alert" className="ml-6 text-sm text-red-600">{errors.acceptedLegalTerms.message}</p>
            )}

            {/* Public Portfolio Acknowledgment - FERPA Compliance */}
            <div className="flex items-start">
              <input
                {...registerField('acceptedPortfolioVisibility', {
                  required: 'You must acknowledge that your learning portfolio will be publicly visible'
                })}
                type="checkbox"
                id="acceptedPortfolioVisibility"
                className="mt-1 h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                aria-invalid={!!errors.acceptedPortfolioVisibility}
                aria-describedby={errors.acceptedPortfolioVisibility ? "portfolio-visibility-error" : undefined}
              />
              <label htmlFor="acceptedPortfolioVisibility" className="ml-2 text-sm text-gray-700">
                I understand that my learning portfolio (quests, evidence, and achievements) will be{' '}
                <span className="font-semibold">publicly visible by default</span> and can be viewed by anyone with my portfolio URL. I can change this setting anytime on my Profile page.
              </label>
            </div>
            {errors.acceptedPortfolioVisibility && (
              <p id="portfolio-visibility-error" role="alert" className="ml-6 text-sm text-red-600">{errors.acceptedPortfolioVisibility.message}</p>
            )}
          </div>

          {/* Optional Handbook Link - No checkbox required, signed in person */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
            <p className="text-sm text-blue-900">
              <strong>Optio Academy Participants:</strong> Please review the{' '}
              <Link to="/academy-handbook" target="_blank" className="text-primary hover:text-optio-purple underline font-semibold">
                Optio Academy Participant Handbook
              </Link>
              . A signed agreement will be completed during in-person enrollment.
            </p>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || isUnder13}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : isUnder13 ? 'Parent account required' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RegisterPage