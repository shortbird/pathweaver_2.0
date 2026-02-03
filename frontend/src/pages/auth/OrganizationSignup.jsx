import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../contexts/AuthContext'
import PasswordStrengthMeter from '../../components/auth/PasswordStrengthMeter'
import api from '../../services/api'
import logger from '../../utils/logger'
import { toast } from 'react-hot-toast'

const OrganizationSignup = () => {
  const { slug } = useParams()
  const { register: registerField, handleSubmit, formState: { errors }, watch, setValue } = useForm()
  const { register, isAuthenticated, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isUnder13, setIsUnder13] = useState(false)
  const [organization, setOrganization] = useState(null)
  const [orgLoading, setOrgLoading] = useState(true)
  const [orgError, setOrgError] = useState(null)
  const password = watch('password')
  const dateOfBirth = watch('date_of_birth')

  // Fetch organization details
  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        setOrgLoading(true)
        const response = await api.get(`/api/organizations/join/${slug}`)
        setOrganization(response.data)
        setOrgError(null)
      } catch (error) {
        logger.error('[OrganizationSignup] Failed to fetch organization:', error)

        if (error.response?.status === 404) {
          setOrgError('Organization not found. Please check the URL and try again.')
        } else if (error.response?.data?.error?.includes('inactive')) {
          setOrgError('This organization is currently inactive and not accepting new members.')
        } else {
          setOrgError('Failed to load organization details. Please try again later.')
        }
      } finally {
        setOrgLoading(false)
      }
    }

    if (slug) {
      fetchOrganization()
    }
  }, [slug])

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user && !authLoading) {
      logger.debug('[OrganizationSignup] User already authenticated, redirecting to dashboard')
      const redirectPath = user.role === 'parent' ? '/parent/dashboard' : '/dashboard'
      navigate(redirectPath, { replace: true })
    }
  }, [isAuthenticated, user, authLoading, navigate])

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

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      // Add organization slug to registration data
      const registrationData = {
        ...data,
        org_slug: slug
      }
      await register(registrationData)
    } catch (error) {
      logger.error('[OrganizationSignup] Registration failed:', error)
      toast.error(error.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  // Loading state
  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  // Error state
  if (orgError || !organization) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
              Organization Not Available
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              {orgError}
            </p>
            <div className="mt-6">
              <Link to="/register" className="text-optio-purple hover:text-optio-pink font-medium">
                Sign up without an organization
              </Link>
              {' '}or{' '}
              <Link to="/login" className="text-optio-purple hover:text-optio-pink font-medium">
                sign in to existing account
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Organization Branding */}
        <div className="text-center">
          {organization.branding_config?.logo_url && (
            <img
              src={organization.branding_config.logo_url}
              alt={`${organization.name} logo`}
              className="mx-auto h-20 w-auto mb-4"
            />
          )}
          <div className="inline-block px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white mb-4">
            <p className="text-sm font-medium">Joining {organization.name}</p>
          </div>
          <h2 className="text-center text-3xl font-bold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link to="/login" className="font-medium text-optio-purple hover:text-optio-pink">
              sign in to your existing account
            </Link>
          </p>
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
                <p className="mt-2 text-sm text-blue-600 bg-blue-50 p-2 rounded">
                  Note: Users under 13 require parental consent to use Optio (COPPA compliance)
                </p>
              )}
            </div>

            {isUnder13 && (
              <div>
                <label htmlFor="parent_email" className="block text-sm font-medium text-gray-700">
                  Parent/Guardian Email Address
                </label>
                <input
                  id="parent_email"
                  {...registerField('parent_email', {
                    required: isUnder13 ? 'Parent/guardian email is required for users under 13' : false,
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Invalid email address'
                    }
                  })}
                  type="email"
                  className="input-field mt-1"
                  placeholder="parent@example.com"
                  aria-invalid={!!errors.parent_email}
                  aria-describedby={errors.parent_email ? "parent-email-error" : undefined}
                />
                {errors.parent_email && (
                  <p id="parent-email-error" role="alert" className="mt-1 text-sm text-red-600">{errors.parent_email.message}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Your parent/guardian will receive an email to verify consent for your account
                </p>
              </div>
            )}

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

          <div className="space-y-3">
            <div className="flex items-start">
              <input
                {...registerField('acceptedLegalTerms', {
                  required: 'You must accept the Terms of Service and Privacy Policy'
                })}
                type="checkbox"
                id="acceptedLegalTerms"
                className="mt-1 h-4 w-4 text-optio-purple border-gray-300 rounded focus:ring-optio-purple"
                aria-invalid={!!errors.acceptedLegalTerms}
                aria-describedby={errors.acceptedLegalTerms ? "legal-terms-error" : undefined}
              />
              <label htmlFor="acceptedLegalTerms" className="ml-2 text-sm text-gray-700">
                I agree to the{' '}
                <Link to="/terms" target="_blank" className="text-optio-purple hover:text-optio-pink underline">
                  Terms of Service
                </Link>
                {' '}and{' '}
                <Link to="/privacy" target="_blank" className="text-optio-purple hover:text-optio-pink underline">
                  Privacy Policy
                </Link>
              </label>
            </div>
            {errors.acceptedLegalTerms && (
              <p id="legal-terms-error" role="alert" className="ml-6 text-sm text-red-600">{errors.acceptedLegalTerms.message}</p>
            )}

            <div className="flex items-start">
              <input
                {...registerField('acceptedPortfolioVisibility', {
                  required: 'You must acknowledge that your learning portfolio will be publicly visible'
                })}
                type="checkbox"
                id="acceptedPortfolioVisibility"
                className="mt-1 h-4 w-4 text-optio-purple border-gray-300 rounded focus:ring-optio-purple"
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

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default OrganizationSignup
