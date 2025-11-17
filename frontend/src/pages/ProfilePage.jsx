import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import ParentInvitationSection from '../components/parent/ParentInvitationSection'
import {
  DocumentTextIcon,
  StarIcon,
  PencilIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  RocketLaunchIcon
} from '@heroicons/react/24/outline'

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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  // Get user initials for avatar
  const initials = `${profileData?.user?.first_name?.charAt(0) || ''}${profileData?.user?.last_name?.charAt(0) || ''}`.toUpperCase()
  const memberSince = new Date(profileData?.user?.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Header with Brand Gradient */}
      <header className="bg-gradient-primary text-white py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-6">
            {/* Avatar Circle with Initials */}
            <div
              className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/30 shadow-lg flex-shrink-0"
            >
              <span className="text-4xl font-bold" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                {initials}
              </span>
            </div>

            {/* User Info */}
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl font-bold mb-1" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                {profileData?.user?.first_name} {profileData?.user?.last_name}
              </h1>
              <p className="text-white/90 text-base sm:text-lg" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Learning since {memberSince}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">

          {/* Personal Information Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Personal Information
              </h2>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-primary text-white rounded-lg font-semibold shadow-sm hover:shadow-md transition-all"
                  style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                >
                  <PencilIcon className="w-4 h-4" />
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
                      First Name
                    </label>
                    <input
                      {...register('first_name', {
                        required: 'First name is required'
                      })}
                      type="text"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-optio-purple focus:outline-none transition-colors"
                      style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                    />
                    {errors.first_name && (
                      <p className="mt-1 text-sm text-red-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                        {errors.first_name.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
                      Last Name
                    </label>
                    <input
                      {...register('last_name', {
                        required: 'Last name is required'
                      })}
                      type="text"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-optio-purple focus:outline-none transition-colors"
                      style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                    />
                    {errors.last_name && (
                      <p className="mt-1 text-sm text-red-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                        {errors.last_name.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-gradient-primary text-white rounded-lg font-semibold shadow-sm hover:shadow-md transition-all"
                    style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                  >
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
                    className="px-6 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                    style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-600 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
                    Name
                  </p>
                  <p className="text-lg text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    {profileData?.user.first_name} {profileData?.user.last_name}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
                    Email
                  </p>
                  <p className="text-lg text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    {profileData?.user.email}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
                    Member Since
                  </p>
                  <p className="text-lg text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    {new Date(profileData?.user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Parent Access Section (students only) */}
          {user?.role !== 'parent' && <ParentInvitationSection />}

          {/* Your Growth (Stats) Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <SparklesIcon className="w-7 h-7 text-optio-purple" />
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Your Growth
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
                    <SparklesIcon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
                    Experience Earned
                  </p>
                </div>
                <p className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  {profileData?.total_xp || 0} XP
                </p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                    <RocketLaunchIcon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
                    Adventures Completed
                  </p>
                </div>
                <p className="text-4xl font-bold text-green-600" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  {profileData?.completed_quests || 0}
                </p>
              </div>
            </div>
          </div>

          {/* My Learning Quick Links */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              My Learning
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Portfolio/Diploma Link */}
              <Link
                to="/diploma"
                className="group flex items-center gap-4 p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-optio-purple hover:shadow-md transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center group-hover:bg-gradient-to-r group-hover:from-[#6d469b] group-hover:to-[#ef597b] transition-all flex-shrink-0">
                  <DocumentTextIcon className="w-6 h-6 text-optio-purple group-hover:text-white transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-gray-900 text-base" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                    Portfolio
                  </div>
                  <div className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    Public showcase
                  </div>
                </div>
              </Link>

              {/* Constellation Link */}
              <Link
                to="/constellation"
                className="group flex items-center gap-4 p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-optio-purple hover:shadow-md transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center group-hover:bg-gradient-to-r group-hover:from-[#6d469b] group-hover:to-[#ef597b] transition-all flex-shrink-0">
                  <StarIcon className="w-6 h-6 text-optio-purple group-hover:text-white transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-gray-900 text-base" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                    Constellation
                  </div>
                  <div className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    Star map view
                  </div>
                </div>
              </Link>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-xl shadow-sm border-2 border-red-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <ExclamationTriangleIcon className="w-7 h-7 text-red-600" />
              <h2 className="text-2xl font-bold text-red-600" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Danger Zone
              </h2>
            </div>

            {profileData?.user?.deletion_status === 'pending' ? (
              <div className="space-y-4">
                <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                  <p className="text-base font-bold text-yellow-900 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                    ⚠️ Account deletion scheduled
                  </p>
                  <p className="text-sm text-yellow-800" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    Your account will be permanently deleted on{' '}
                    <strong>{new Date(profileData?.user?.deletion_scheduled_for).toLocaleDateString()}</strong>
                  </p>
                </div>
                <button
                  onClick={cancelAccountDeletion}
                  className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors shadow-sm"
                  style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                >
                  Cancel Deletion
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Permanently delete your account and all associated data. You will have a 30-day grace period to cancel.
                </p>
                <button
                  onClick={requestAccountDeletion}
                  className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors shadow-sm"
                  style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                >
                  Delete My Account
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

export default ProfilePage
