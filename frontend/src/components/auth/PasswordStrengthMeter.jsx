/**
 * Password Strength Meter Component
 *
 * Visual indicator and validation feedback for password strength.
 * Shows real-time feedback as user types password.
 *
 * Phase 1 Security Fix: Enhanced password requirements
 * - Minimum 12 characters (increased from 6)
 * - Requires uppercase, lowercase, digit, and special character
 * - Prevents common passwords
 *
 * Created: January 2025 (Phase 1 Security Improvements)
 */

import React, { useMemo } from 'react'

const PasswordStrengthMeter = ({ password }) => {
  // Calculate password strength and get validation errors
  const { strength, score, errors, requirements } = useMemo(() => {
    const errors = []
    const requirements = []
    let score = 0

    if (!password) {
      return {
        strength: 'none',
        score: 0,
        errors: [],
        requirements: [
          { text: 'At least 12 characters', met: false },
          { text: 'One uppercase letter (A-Z)', met: false },
          { text: 'One lowercase letter (a-z)', met: false },
          { text: 'One digit (0-9)', met: false },
          { text: 'One special character (!@#$...)', met: false },
        ],
      }
    }

    // Length check (12+ characters)
    const lengthMet = password.length >= 12
    requirements.push({ text: 'At least 12 characters', met: lengthMet })
    if (lengthMet) {
      score += 20
      if (password.length >= 16) score += 5
      if (password.length >= 20) score += 5
    } else {
      errors.push('Password must be at least 12 characters long')
    }

    // Uppercase check
    const hasUppercase = /[A-Z]/.test(password)
    requirements.push({ text: 'One uppercase letter (A-Z)', met: hasUppercase })
    if (hasUppercase) {
      score += 10
    } else {
      errors.push('Password must contain at least one uppercase letter')
    }

    // Lowercase check
    const hasLowercase = /[a-z]/.test(password)
    requirements.push({ text: 'One lowercase letter (a-z)', met: hasLowercase })
    if (hasLowercase) {
      score += 10
    } else {
      errors.push('Password must contain at least one lowercase letter')
    }

    // Digit check
    const hasDigit = /\d/.test(password)
    requirements.push({ text: 'One digit (0-9)', met: hasDigit })
    if (hasDigit) {
      score += 10
    } else {
      errors.push('Password must contain at least one digit')
    }

    // Special character check
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;/~`]/.test(password)
    requirements.push({
      text: 'One special character (!@#$...)',
      met: hasSpecial,
    })
    if (hasSpecial) {
      score += 10
    } else {
      errors.push('Password must contain at least one special character')
    }

    // Common password check (basic patterns)
    const commonPatterns = [
      'password',
      '123456',
      'qwerty',
      'abc123',
      'letmein',
      'welcome',
      'admin',
    ]
    const lowerPassword = password.toLowerCase()
    const isCommon = commonPatterns.some((pattern) =>
      lowerPassword.includes(pattern)
    )

    if (isCommon) {
      errors.push('Password contains common patterns - please choose something more unique')
      score -= 20
    }

    // Unique character bonus
    const uniqueChars = new Set(password).size
    if (uniqueChars >= 8) score += 10
    if (uniqueChars >= 12) score += 10

    // Pattern penalty
    if (/^[a-zA-Z]+\d+$/.test(password)) {
      score -= 10
      errors.push('Avoid simple patterns like letters followed by numbers')
    }

    // Cap score at 100
    score = Math.max(0, Math.min(100, score))

    // Determine strength label
    let strength
    if (score <= 25) strength = 'very-weak'
    else if (score <= 50) strength = 'weak'
    else if (score <= 75) strength = 'medium'
    else if (score <= 90) strength = 'strong'
    else strength = 'very-strong'

    return { strength, score, errors, requirements }
  }, [password])

  // Strength label and color
  const strengthConfig = {
    none: { label: '', color: 'bg-gray-200', textColor: 'text-gray-500' },
    'very-weak': { label: 'Very Weak', color: 'bg-red-500', textColor: 'text-red-600' },
    weak: { label: 'Weak', color: 'bg-orange-500', textColor: 'text-orange-600' },
    medium: { label: 'Medium', color: 'bg-yellow-500', textColor: 'text-yellow-600' },
    strong: { label: 'Strong', color: 'bg-green-500', textColor: 'text-green-600' },
    'very-strong': {
      label: 'Very Strong',
      color: 'bg-green-700',
      textColor: 'text-green-700',
    },
  }

  const config = strengthConfig[strength]

  if (!password) {
    return null // Don't show meter if no password entered yet
  }

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-700">Password Strength</span>
          <span className={`text-sm font-semibold ${config.textColor}`}>
            {config.label}
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${config.color}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      {/* Requirements checklist */}
      <div className="space-y-1">
        {requirements.map((req, index) => (
          <div key={index} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5">
              {req.met ? (
                <svg
                  className="w-4 h-4 text-green-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </span>
            <span className={req.met ? 'text-green-700 font-medium' : 'text-gray-600'}>
              {req.text}
            </span>
          </div>
        ))}
      </div>

      {/* Show errors if password doesn't meet requirements */}
      {errors.length > 0 && score < 100 && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm">
          <p className="font-semibold text-red-800 mb-1">Password requirements not met:</p>
          <ul className="list-disc list-inside space-y-0.5 text-red-700">
            {errors.slice(0, 3).map((error, index) => (
              <li key={index}>{error}</li>
            ))}
            {errors.length > 3 && <li>And {errors.length - 3} more...</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

export default PasswordStrengthMeter
