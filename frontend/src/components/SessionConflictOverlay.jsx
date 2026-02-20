import { useAuth } from '../contexts/AuthContext'

export default function SessionConflictOverlay() {
  const { sessionConflict } = useAuth()

  if (!sessionConflict) return null

  const isLogout = sessionConflict.action === 'logout'

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-80 flex items-center justify-center p-4 z-[9999]">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 text-center">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          {isLogout ? (
            <svg className="w-16 h-16 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          ) : (
            <svg className="w-16 h-16 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          {isLogout ? 'Session Ended' : 'Session Changed'}
        </h2>

        {/* Message */}
        <p className="text-gray-600 mb-2">
          {isLogout
            ? 'You were logged out from another tab.'
            : 'A different account was signed into from another tab.'}
        </p>
        {!isLogout && sessionConflict.newUserName && (
          <p className="text-sm text-gray-500 mb-6">
            Now signed in as <span className="font-semibold text-gray-700">{sessionConflict.newUserName}</span>
          </p>
        )}
        {(isLogout || !sessionConflict.newUserName) && <div className="mb-6" />}

        {/* Warning */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-left">
          <p className="text-sm text-yellow-800">
            Any unsaved changes in this tab may have been lost. Please sign in again to continue.
          </p>
        </div>

        {/* Action */}
        <button
          onClick={() => { window.location.href = '/login' }}
          className="w-full py-3 px-4 text-sm font-medium rounded-lg text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-optio-purple transition-all"
        >
          Go to Login
        </button>
      </div>
    </div>
  )
}
