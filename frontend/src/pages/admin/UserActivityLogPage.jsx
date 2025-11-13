import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import UserActivityLog from '../../components/admin/UserActivityLog'
import { FiArrowLeft } from 'react-icons/fi'

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
        <FiArrowLeft /> Back to Users
      </button>

      <UserActivityLog userId={userId} />
    </div>
  )
}

export default UserActivityLogPage
