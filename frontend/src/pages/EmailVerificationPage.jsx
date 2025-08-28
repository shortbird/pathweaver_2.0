import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../services/api'

const EmailVerificationPage = () => {
  const location = useLocation()
  const email = location.state?.email || ''
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  const handleResendEmail = async () => {
    if (!email) {
      toast.error('No email address found. Please register again.')
      return
    }

    setResending(true)
    try {
      await api.post('/auth/resend-verification', { email })
      setResent(true)
      toast.success('Verification email resent successfully!')
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to resend verification email'
      toast.error(message)
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {/* Email Icon */}
          <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-purple-100 mb-4">
            <svg className="h-12 w-12 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Check Your Email
          </h2>
          
          <div className="space-y-4">
            <p className="text-lg text-gray-600">
              We've sent a verification link to:
            </p>
            
            {email && (
              <p className="text-lg font-semibold text-gray-900">
                {email}
              </p>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-left">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" 
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" 
                      clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Important: Verify Before Logging In
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>You must click the verification link in your email before you can log in.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-left space-y-3 bg-gray-50 rounded-lg p-4">
              <p className="font-semibold text-gray-900">Next steps:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
                <li>Open your email inbox</li>
                <li>Look for an email from OptioQuest</li>
                <li>Click the verification link in the email</li>
                <li>Once verified, you can log in with your credentials</li>
              </ol>
            </div>

            <div className="pt-4 space-y-3">
              <p className="text-sm text-gray-500">
                Didn't receive the email? Check your spam folder or
              </p>
              
              <button
                onClick={handleResendEmail}
                disabled={resending || resent}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md 
                  ${resent 
                    ? 'bg-green-100 text-green-800 cursor-not-allowed' 
                    : 'text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {resending ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" 
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending...
                  </>
                ) : resent ? (
                  <>
                    <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" 
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" 
                        clipRule="evenodd" />
                    </svg>
                    Email Sent!
                  </>
                ) : (
                  'Resend Verification Email'
                )}
              </button>
            </div>

            <div className="pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Already verified your email?{' '}
                <Link to="/login" className="font-medium text-purple-600 hover:text-purple-500">
                  Go to Login
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EmailVerificationPage