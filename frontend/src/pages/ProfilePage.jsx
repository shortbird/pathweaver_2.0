import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import { getTierDisplayName } from '../utils/tierMapping'

const ProfilePage = () => {
  const { user, updateUser, refreshUser, isCreator } = useAuth()
  const [profileData, setProfileData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
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

  const handleRefreshUserData = async () => {
    setRefreshing(true)
    try {
      const success = await refreshUser()
      if (success) {
        toast.success('User data refreshed! Your current tier should now be displayed correctly.')
        // Also refresh the profile data to ensure consistency
        await fetchProfile()
      } else {
        toast.error('Failed to refresh user data')
      }
    } catch (error) {
      console.error('Error refreshing user data:', error)
      toast.error('Failed to refresh user data')
    } finally {
      setRefreshing(false)
    }
  }

  const downloadTranscript = async () => {
    try {
      const response = await api.get('/api/users/transcript')
      const transcript = response.data
      
      const blob = new Blob([JSON.stringify(transcript, null, 2)], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `transcript_${user?.first_name || 'user'}_${user?.last_name || ''}_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      toast.success('Transcript downloaded!')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to download transcript')
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">My Profile</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
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
        </div>

        <div className="space-y-6">
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Statistics</h2>
            <div className="space-y-3">
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

          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Subscription</h2>
            <div className="mb-4">
              <span className="bg-secondary text-text px-3 py-1 rounded-full text-sm font-medium">
                {getTierDisplayName(user?.subscription_tier).toUpperCase()}
              </span>
            </div>
            
            <div className="mb-4">
              <button
                onClick={handleRefreshUserData}
                disabled={refreshing}
                className="text-primary hover:underline text-sm disabled:text-gray-400"
              >
                {refreshing ? 'Refreshing...' : 'Refresh account data'}
              </button>
            </div>

            {isCreator && (
              <button
                onClick={downloadTranscript}
                className="btn-primary w-full"
              >
                Download Transcript
              </button>
            )}
            {!isCreator && (
              <p className="text-sm text-gray-600">
                Upgrade to Supported tier to download your transcript
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage