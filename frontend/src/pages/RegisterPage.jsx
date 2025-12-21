import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import PasswordStrengthMeter from '../components/auth/PasswordStrengthMeter'
import logger from '../utils/logger'

const RegisterPage = () => {
  const { register: registerField, handleSubmit, formState: { errors }, watch } = useForm()
  const { register, isAuthenticated, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isUnder13, setIsUnder13] = useState(false)
  const password = watch('password')
  const dateOfBirth = watch('date_of_birth')

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user && !authLoading) {
      logger.debug('[RegisterPage] User already authenticated, redirecting to dashboard')
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
    await register(data)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link to="/login" className="font-medium text-primary hover:text-purple-500">
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
                  {...registerField('first_name', {
                    required: 'First name is required'
                  })}
                  type="text"
                  className="input-field mt-1"
                  placeholder="John"
                />
                {errors.first_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
                )}
              </div>
              
              <div>
                <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">
                  Last Name
                </label>
                <input
                  {...registerField('last_name', {
                    required: 'Last name is required'
                  })}
                  type="text"
                  className="input-field mt-1"
                  placeholder="Doe"
                />
                {errors.last_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
                )}
              </div>
            </div>
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
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
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700">
                Date of Birth
              </label>
              <input
                {...registerField('date_of_birth', {
                  required: 'Date of birth is required for age verification'
                })}
                type="date"
                className="input-field mt-1"
                max={new Date().toISOString().split('T')[0]}
              />
              {errors.date_of_birth && (
                <p className="mt-1 text-sm text-red-600">{errors.date_of_birth.message}</p>
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
                />
                {errors.parent_email && (
                  <p className="mt-1 text-sm text-red-600">{errors.parent_email.message}</p>
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
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
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
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>
            
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <div className="relative mt-1">
                <input
                  {...registerField('confirmPassword', {
                    required: 'Please confirm your password',
                    validate: value => value === password || 'Passwords do not match'
                  })}
                  type={showConfirmPassword ? "text" : "password"}
                  className="input-field pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
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
              <p className="ml-6 text-sm text-red-600">{errors.acceptedLegalTerms.message}</p>
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

export default RegisterPage