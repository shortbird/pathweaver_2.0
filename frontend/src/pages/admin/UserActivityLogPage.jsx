import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import UserActivityLog from '../../components/admin/UserActivityLog'

/**
 * User Activity Log Page
 *
 * Wrapper page for viewing individual user activity logs in admin panel.
 */
const UserActivityLogPage = () => {
  const { userId } = useParams()
  const navigate = useNavigate()

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate('/admin/users')}
        className="flex items-center gap-2 text-gray-600 hover:text-optio-purple transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Users
      </button>

      <UserActivityLog userId={userId} />
    </div>
  )
}

export default UserActivityLogPage
