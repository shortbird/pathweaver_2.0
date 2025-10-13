import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'

const ProfilePage = () => {
  const { user, updateUser } = useAuth()
  const [profileData, setProfileData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const { register, handleSubmit, formState: { errors }, reset } = useForm()

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      const response = await api.get('/api/users/profile')
      setProfileData(response.data)
      reset({
        first_name: response.data.user.first_name,
        last_name: response.data.user.last_name
      })
    } catch (error) {
      console.error('Failed to fetch profile:', error)
      toast.error('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data) => {
    try {
      const response = await api.put('/api/users/profile', data)
      updateUser(response.data)
      setProfileData({ ...profileData, user: response.data })
      setEditing(false)
      toast.success('Profile updated successfully!')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update profile')
    }
  }

  const downloadAllData = async () => {
    try {
      const response = await api.get('/api/users/export-data')
      const allData = response.data

      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `optio_data_export_${user?.first_name || 'user'}_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      toast.success('All data exported successfully!')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to export data')
    }
  }

  const requestAccountDeletion = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete your account? This will:\n\n' +
      '• Schedule your account for permanent deletion in 30 days\n' +
      '• You can cancel within the 30-day grace period\n' +
      '• All your data will be permanently deleted after 30 days\n\n' +
      'This action cannot be undone after the grace period expires.'
    )

    if (!confirmed) return

    try {
      const response = await api.post('/api/users/delete-account', {
        reason: 'User requested deletion'
      })
      toast.success(`Account deletion scheduled. Grace period: 30 days`)
      await fetchProfile() // Refresh to show deletion status
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to request account deletion')
    }
  }

  const cancelAccountDeletion = async () => {
    try {
      await api.post('/api/users/cancel-deletion')
      toast.success('Account deletion cancelled!')
      await fetchProfile() // Refresh to clear deletion status
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to cancel deletion')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">My Profile</h1>

      <div className="space-y-6">
        {/* Personal Information - Full Width */}
        <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Personal Information</h2>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-primary hover:underline"
                >
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name
                    </label>
                    <input
                      {...register('first_name', {
                        required: 'First name is required'
                      })}
                      type="text"
                      className="input-field"
                    />
                    {errors.first_name && (
                      <p className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name
                    </label>
                    <input
                      {...register('last_name', {
                        required: 'Last name is required'
                      })}
                      type="text"
                      className="input-field"
                    />
                    {errors.last_name && (
                      <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-4">
                  <button type="submit" className="btn-primary">
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false)
                      reset({
                        first_name: profileData.user.first_name,
                        last_name: profileData.user.last_name
                      })
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Name</p>
                  <p className="font-medium">
                    {profileData?.user.first_name} {profileData?.user.last_name}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Member Since</p>
                  <p className="font-medium">
                    {new Date(profileData?.user.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            )}
          </div>

        {/* Statistics - Full Width */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600">Total XP</p>
              <p className="text-2xl font-bold text-primary">
                {profileData?.total_xp || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Quests Completed</p>
              <p className="text-2xl font-bold text-secondary">
                {profileData?.completed_quests || 0}
              </p>
            </div>
          </div>
        </div>

        {/* My Learning - Full Width */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">My Learning</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Link
              to="/constellation"
              className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 rounded-lg transition-all group"
            >
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                <div>
                  <div className="font-medium text-gray-900">Constellation</div>
                  <div className="text-xs text-gray-600">Star map view</div>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link
              to="/credits"
              className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 rounded-lg transition-all group"
            >
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <div>
                  <div className="font-medium text-gray-900">Credit Tracker</div>
                  <div className="text-xs text-gray-600">Academic credits</div>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link
              to="/transcript"
              className="flex items-center justify-between p-3 bg-gradient-to-r from-rose-50 to-red-50 hover:from-rose-100 hover:to-red-100 rounded-lg transition-all group"
            >
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <div className="font-medium text-gray-900">Transcript</div>
                  <div className="text-xs text-gray-600">Full record</div>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <button
              onClick={downloadAllData}
              className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 rounded-lg transition-all group text-left"
            >
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <div>
                  <div className="font-medium text-gray-900">Download All Data</div>
                  <div className="text-xs text-gray-600">Export everything</div>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Danger Zone - Full Width */}
        <div className="card border-red-200">
          <h2 className="text-xl font-semibold mb-4 text-red-600">Danger Zone</h2>
            {profileData?.user?.deletion_status === 'pending' ? (
              <div className="space-y-3">
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800 font-medium">
                    Account deletion scheduled
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">
                    Your account will be permanently deleted on{' '}
                    {new Date(profileData?.user?.deletion_scheduled_for).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={cancelAccountDeletion}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Cancel Deletion
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={requestAccountDeletion}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Delete My Account
                </button>
                <p className="text-xs text-gray-500">
                  Permanently delete your account and all associated data. You will have a 30-day grace period to cancel.
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

export default ProfilePage