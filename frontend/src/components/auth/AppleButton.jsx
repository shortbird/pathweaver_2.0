import React, { useState } from 'react'
import PropTypes from 'prop-types'
import authService from '../../services/authService'
import { stashPendingCodes, clearPendingCodes } from './oauthPendingCodes'

/**
 * Sign in with Apple Button
 *
 * Mirrors GoogleButton: stash any pending codes, hand off to Supabase OAuth,
 * and let /auth/callback finish the exchange. Styling follows Apple's Human
 * Interface Guidelines for the black variant (white mark, no border).
 *
 * Web parity matters here beyond looks: an account created with Apple on the
 * mobile app has no password, and until this button existed the only way onto
 * the web platform was a password reset — which fails outright for anyone who
 * used Hide My Email.
 */
const AppleButton = ({ mode = 'signin', onError, disabled = false, className = '', promoCode = null, invitationCode = null, orgInvitationCode = null, onBeforeRedirect = null }) => {
  const [loading, setLoading] = useState(false)

  const handleAppleClick = async () => {
    if (loading || disabled) return

    setLoading(true)

    try {
      if (onBeforeRedirect) {
        onBeforeRedirect()
      }

      stashPendingCodes({ promoCode, invitationCode, orgInvitationCode })

      const result = await authService.signInWithApple()

      if (!result.success && !result.redirecting) {
        // Only clear when the redirect never happened — otherwise we'd throw
        // away codes the callback is about to need.
        clearPendingCodes()
        onError?.(result.error || 'Failed to sign in with Apple')
        setLoading(false)
      }
      // On success the browser leaves for Apple; keep the loading state until it does.

    } catch (error) {
      clearPendingCodes()
      onError?.(error.message || 'Failed to sign in with Apple')
      setLoading(false)
    }
  }

  const buttonText = mode === 'signup'
    ? (loading ? 'Connecting...' : 'Sign up with Apple')
    : (loading ? 'Connecting...' : 'Sign in with Apple')

  return (
    <button
      type="button"
      onClick={handleAppleClick}
      disabled={loading || disabled}
      className={`
        w-full flex items-center justify-center gap-3
        px-4 py-3 rounded-lg
        bg-black hover:bg-gray-900
        text-white font-medium
        transition-colors duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500
        ${className}
      `}
      aria-label={buttonText}
    >
      {loading ? (
        <svg
          className="animate-spin h-5 w-5 text-white"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <AppleIcon />
      )}
      <span>{buttonText}</span>
    </button>
  )
}

/**
 * Apple logo mark, drawn in currentColor so it stays white on the black button.
 */
const AppleIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M17.05 12.54c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.28-1.27 3.13-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.72-1.04-2.75-4.12M14.5 4.6c.71-.87 1.19-2.07 1.06-3.27-1.02.04-2.26.68-3 1.54-.66.77-1.24 2-1.08 3.18 1.14.09 2.3-.58 3.02-1.45" />
  </svg>
)

AppleButton.propTypes = {
  mode: PropTypes.oneOf(['signin', 'signup']),
  onError: PropTypes.func,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  promoCode: PropTypes.string,
  invitationCode: PropTypes.string,
  orgInvitationCode: PropTypes.string,
  onBeforeRedirect: PropTypes.func
}

export default AppleButton
