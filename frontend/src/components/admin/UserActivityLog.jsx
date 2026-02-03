import React, { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import UserJourneyFlow from './UserJourneyFlow'

/**
 * User Activity Log Component
 *
 * Displays user journey visualization for admin review.
 * Shows session-based activity with meaningful action summaries.
 */

const UserActivityLog = ({ userId, userName }) => {
  const [userInfo, setUserInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (userId) {
      fetchUserInfo()
    }
  }, [userId])

  const fetchUserInfo = async () => {
    setLoading(true)
    try {
      const response = await api.get(`/api/admin/analytics/user/${userId}/activity?limit=1`)

      if (response.data.success) {
        setUserInfo(response.data.data.user)
      }
    } catch (error) {
      console.error('Error fetching user info:', error)
      toast.error('Failed to load user info')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  return (
    <UserJourneyFlow
      userId={userId}
      userName={userInfo?.name || userName}
    />
  )
}

export default UserActivityLog
