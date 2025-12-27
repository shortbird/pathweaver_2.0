import React, { useState, useEffect, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import toast from 'react-hot-toast'
import ChatLogsModal from './ChatLogsModal'
import CheckinHistoryModal from '../advisor/CheckinHistoryModal'
import { startMasquerade } from '../../services/masqueradeService'
// import { useAdminSubscriptionTiers, formatPrice } from '../../hooks/useSubscriptionTiers' // REMOVED - Phase 3 refactoring (January 2025)

const UserDetailsModal = ({ user, onClose, onSave }) => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('profile')
  const [formData, setFormData] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    email: user.email || '',
    role: user.role || 'student',
    phone_number: user.phone_number || '',
    address_line1: user.address_line1 || '',
    address_line2: user.address_line2 || '',
    city: user.city || '',
    state: user.state || '',
    postal_code: user.postal_code || '',
    country: user.country || '',
    date_of_birth: user.date_of_birth || ''
  })
  const [loading, setLoading] = useState(false)
  const [showChatLogsModal, setShowChatLogsModal] = useState(false)
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false)
  const [showAdvisorCheckinsModal, setShowAdvisorCheckinsModal] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(user.avatar_url || '')
  const [masquerading, setMasquerading] = useState(false)

  useEffect(() => {
    fetchUserDetails()
  }, [user.id])

  const fetchUserDetails = async () => {
    try {
      const response = await api.get(`/api/admin/users/${user.id}`)
      // Update formData with fetched user details (including new fields)
      setFormData(prev => ({
        ...prev,
        phone_number: response.data.phone_number || '',
        address_line1: response.data.address_line1 || '',
        address_line2: response.data.address_line2 || '',
        city: response.data.city || '',
        state: response.data.state || '',
        postal_code: response.data.postal_code || '',
        country: response.data.country || '',
        date_of_birth: response.data.date_of_birth || ''
      }))
      setCurrentAvatarUrl(response.data.avatar_url || '')
    } catch (error) {
      toast.error('Failed to load user details')
    }
  }

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSaveProfile = async () => {
    setLoading(true)
    try {
      await api.put(`/api/admin/users/${user.id}`, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        phone_number: formData.phone_number,
        address_line1: formData.address_line1,
        address_line2: formData.address_line2,
        city: formData.city,
        state: formData.state,
        postal_code: formData.postal_code,
        country: formData.country,
        date_of_birth: formData.date_of_birth
      })
      toast.success('Profile updated successfully')
      onSave()
    } catch (error) {
      toast.error('Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateRole = async () => {
    const roleDisplayNames = {
      student: 'Student',
      parent: 'Parent',
      advisor: 'Advisor',
      admin: 'Administrator'
    };
    const displayName = roleDisplayNames[formData.role] || formData.role;
    if (window.confirm(`Change role to ${displayName}?`)) {
      setLoading(true)
      try {
        await api.put(`/api/admin/users/${user.id}/role`, {
          role: formData.role
        })
        toast.success('Role updated successfully')
        onSave()
      } catch (error) {
        toast.error('Failed to update role')
      } finally {
        setLoading(false)
      }
    }
  }

  const handleViewChatLogs = () => {
    setShowChatLogsModal(true)
  }

  const handleResetPassword = () => {
    setShowResetPasswordModal(true)
  }

  const handleViewAdvisorCheckins = () => {
    setShowAdvisorCheckinsModal(true)
  }

  const handleMasquerade = async () => {
    if (masquerading) {
      toast.error('Please exit current masquerade session first')
      return
    }

    // Confirm masquerade action
    if (!window.confirm(`Masquerade as ${user.display_name || user.email}?\n\nYou will be viewing the platform as this user.`)) {
      return
    }

    setMasquerading(true)

    try {
      const result = await startMasquerade(user.id, '', api)

      if (result.success) {
        toast.success(`Now masquerading as ${result.targetUser.display_name || result.targetUser.email}`)

        // Close modal
        onClose()

        // Redirect based on user role
        setTimeout(() => {
          const role = result.targetUser.role

          if (role === 'parent') {
            navigate('/parent/dashboard')
          } else if (role === 'advisor') {
            navigate('/advisor/dashboard')
          } else if (role === 'student') {
            navigate('/dashboard')
          } else {
            navigate('/dashboard') // Default fallback
          }

          window.location.reload() // Force reload to apply new token
        }, 500)
      } else {
        toast.error(result.error || 'Failed to start masquerade')
        setMasquerading(false)
      }
    } catch (error) {
      console.error('Masquerade error:', error)
      toast.error('Failed to start masquerade session')
      setMasquerading(false)
    }
  }

  const handleVerifyEmail = async () => {
    if (window.confirm(`Manually verify email for ${user.first_name} ${user.last_name} (${user.email})?\n\nThis will allow them to login without email verification.`)) {
      try {
        await api.post(`/api/admin/users/${user.id}/verify-email`, {})
        toast.success(`Email verified for ${user.first_name} ${user.last_name}`)
        onSave()
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to verify email')
      }
    }
  }

  const handleDeleteUser = async () => {
    if (window.confirm(`Are you sure you want to delete ${user.first_name} ${user.last_name}?\n\nThis action cannot be undone and will permanently delete all user data.`)) {
      try {
        await api.delete(`/api/admin/users/${user.id}`)
        toast.success('User deleted successfully')
        onClose()
        onSave()
      } catch (error) {
        toast.error('Failed to delete user')
      }
    }
  }

  const handleUploadAvatar = () => {
    // Create file input element
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/jpeg,image/jpg,image/png,image/gif,image/webp'

    fileInput.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024
      if (file.size > maxSize) {
        toast.error('Image size must be less than 5MB')
        return
      }

      // Create FormData for file upload
      const formData = new FormData()
      formData.append('file', file)

      try {
        setUploadingAvatar(true)
        const loadingToast = toast.loading('Uploading profile picture...')

        const response = await api.post(
          `/api/admin/users/${user.id}/upload-avatar`,
          formData
        )

        toast.dismiss(loadingToast)
        toast.success('Profile picture uploaded successfully')
        setCurrentAvatarUrl(response.data.avatar_url)
        onSave()
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to upload profile picture')
      } finally {
        setUploadingAvatar(false)
      }
    }

    // Trigger file selection dialog
    fileInput.click()
  }

  const getRoleDisplayName = (role) => {
    const roleNames = {
      student: 'Student',
      parent: 'Parent',
      advisor: 'Advisor',
      admin: 'Administrator'
    }
    return roleNames[role] || role
  }

  const getRoleBadge = (role) => {
    const colors = {
      student: 'bg-blue-100 text-blue-700',
      parent: 'bg-green-100 text-green-700',
      advisor: 'bg-yellow-100 text-yellow-700',
      admin: 'bg-red-100 text-red-700'
    }
    return colors[role] || 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">User Details</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {['profile', 'role', 'actions'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-medium capitalize ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {activeTab === 'profile' && (
            <div className="space-y-4">
              {/* Profile Picture Section */}
              <div className="flex flex-col items-center py-4 border-b border-gray-200">
                <div className="relative mb-4">
                  {currentAvatarUrl ? (
                    <img
                      src={currentAvatarUrl}
                      alt={`Profile picture of ${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User profile picture'}
                      className="w-24 h-24 rounded-full object-cover border-4 border-gray-200"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center border-4 border-gray-200">
                      <span className="text-white text-3xl font-bold">
                        {(formData.first_name?.[0] || user.email[0]).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleUploadAvatar}
                  disabled={uploadingAvatar}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {uploadingAvatar ? 'Uploading...' : 'Upload Profile Picture'}
                </button>
                <p className="text-xs text-gray-500 mt-2">JPEG, PNG, GIF, or WEBP (max 5MB)</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="user-first-name" className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    id="user-first-name"
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="user-last-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    id="user-last-name"
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="user-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                    id="user-email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="user-phone-number" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                    id="user-phone-number"
                  type="tel"
                  name="phone_number"
                  value={formData.phone_number}
                  onChange={handleInputChange}
                  placeholder="(555) 123-4567"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="user-date-of-birth" className="block text-sm font-medium text-gray-700 mb-1">
                  Date of Birth
                </label>
                <input
                    id="user-date-of-birth"
                  type="date"
                  name="date_of_birth"
                  value={formData.date_of_birth}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="user-address-line1" className="block text-sm font-medium text-gray-700 mb-1">
                  Address Line 1
                </label>
                <input
                    id="user-address-line1"
                  type="text"
                  name="address_line1"
                  value={formData.address_line1}
                  onChange={handleInputChange}
                  placeholder="123 Main Street"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="user-address-line2" className="block text-sm font-medium text-gray-700 mb-1">
                  Address Line 2
                </label>
                <input
                    id="user-address-line2"
                  type="text"
                  name="address_line2"
                  value={formData.address_line2}
                  onChange={handleInputChange}
                  placeholder="Apt, Suite, Unit (optional)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="user-city" className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    id="user-city"
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    placeholder="New York"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="user-state" className="block text-sm font-medium text-gray-700 mb-1">
                    State/Province
                  </label>
                  <input
                    id="user-state"
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                    placeholder="NY"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="user-postal-code" className="block text-sm font-medium text-gray-700 mb-1">
                    Postal Code
                  </label>
                  <input
                    id="user-postal-code"
                    type="text"
                    name="postal_code"
                    value={formData.postal_code}
                    onChange={handleInputChange}
                    placeholder="10001"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="user-country" className="block text-sm font-medium text-gray-700 mb-1">
                    Country
                  </label>
                  <input
                    id="user-country"
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleInputChange}
                    placeholder="United States"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-2">Read-Only Information</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      User ID
                    </label>
                    <input
                      type="text"
                      value={user.id}
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Created At
                    </label>
                    <input
                      type="text"
                      value={new Date(user.created_at).toLocaleString()}
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
              >
                {loading ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          )}

          {activeTab === 'role' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Role
                </label>
                <span className={`px-3 py-2 rounded-full text-sm font-semibold ${getRoleBadge(user.role || 'student')}`}>
                  {getRoleDisplayName(user.role || 'student')}
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Role
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="student">Student</option>
                  <option value="parent">Parent</option>
                  <option value="advisor">Advisor</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              {/* Role Descriptions */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-semibold text-gray-700 mb-2">Role Descriptions:</p>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li><span className="font-semibold">Student:</span> Can complete quests and build diploma</li>
                  <li><span className="font-semibold">Parent:</span> Can view linked children's progress</li>
                  <li><span className="font-semibold">Advisor:</span> Can manage student groups and provide guidance</li>
                  <li><span className="font-semibold">Admin:</span> Full system access and user management</li>
                </ul>
              </div>

              <button
                onClick={handleUpdateRole}
                disabled={loading || formData.role === (user.role || 'student')}
                className={`w-full py-2 rounded-lg font-medium ${
                  formData.role === (user.role || 'student')
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-optio-purple text-white hover:bg-purple-700'
                } disabled:bg-gray-400`}
              >
                {loading ? 'Updating...' : 'Update Role'}
              </button>
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="space-y-3">
              <p className="text-gray-600 mb-4">Admin actions for this user account</p>

              {/* View Chat Logs */}
              <button
                onClick={handleViewChatLogs}
                className="w-full flex items-center gap-3 px-4 py-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors font-medium text-left"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <div>
                  <p className="font-semibold">View Chat Logs</p>
                  <p className="text-sm text-optio-purple">View AI tutor conversation history</p>
                </div>
              </button>

              {/* View Advisor Check-ins */}
              <button
                onClick={handleViewAdvisorCheckins}
                className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium text-left"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                <div>
                  <p className="font-semibold">View Advisor Check-ins</p>
                  <p className="text-sm text-blue-600">View confidential advisor check-in logs</p>
                </div>
              </button>

              {/* Masquerade */}
              <button
                onClick={handleMasquerade}
                disabled={masquerading}
                className="w-full flex items-center gap-3 px-4 py-3 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors font-medium text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <div>
                  <p className="font-semibold">Masquerade as User</p>
                  <p className="text-sm text-orange-600">View platform as this user</p>
                </div>
              </button>

              {/* Set Password */}
              <button
                onClick={handleResetPassword}
                className="w-full flex items-center gap-3 px-4 py-3 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors font-medium text-left"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <div>
                  <p className="font-semibold">Set Password</p>
                  <p className="text-sm text-yellow-600">Reset user's password</p>
                </div>
              </button>

              {/* Verify Email */}
              <button
                onClick={handleVerifyEmail}
                className="w-full flex items-center gap-3 px-4 py-3 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors font-medium text-left"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-semibold">Verify Email</p>
                  <p className="text-sm text-teal-600">Manually verify user's email address</p>
                </div>
              </button>

              {/* Delete Account */}
              <button
                onClick={handleDeleteUser}
                className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors font-medium text-left"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <div>
                  <p className="font-semibold">Delete Account</p>
                  <p className="text-sm text-red-600">Permanently delete user account</p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chat Logs Modal */}
      {showChatLogsModal && (
        <ChatLogsModal
          user={user}
          onClose={() => setShowChatLogsModal(false)}
        />
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && (
        <ResetPasswordModal
          user={user}
          onClose={() => setShowResetPasswordModal(false)}
          onSuccess={() => {
            setShowResetPasswordModal(false)
            toast.success('Password reset successfully')
            onSave()
          }}
        />
      )}

      {/* Advisor Check-ins Modal */}
      {showAdvisorCheckinsModal && (
        <CheckinHistoryModal
          studentId={user.id}
          studentName={`${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email}
          onClose={() => setShowAdvisorCheckinsModal(false)}
        />
      )}
    </div>
  )
}

// Reset Password Modal Component
const ResetPasswordModal = ({ user, onClose, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState(null)

  const validatePassword = (password) => {
    const errors = []
    if (password.length < 12) {
      errors.push('At least 12 characters')
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('One uppercase letter')
    }
    if (!/[a-z]/.test(password)) {
      errors.push('One lowercase letter')
    }
    if (!/[0-9]/.test(password)) {
      errors.push('One number')
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('One special character')
    }
    return errors
  }

  const handlePasswordChange = (password) => {
    setNewPassword(password)
    const errors = validatePassword(password)
    if (errors.length === 0) {
      setPasswordStrength('strong')
    } else if (errors.length <= 2) {
      setPasswordStrength('medium')
    } else {
      setPasswordStrength('weak')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    const errors = validatePassword(newPassword)
    if (errors.length > 0) {
      toast.error(`Password requirements not met: ${errors.join(', ')}`)
      return
    }

    setLoading(true)
    try {
      await api.post(`/api/admin/users/${user.id}/reset-password`, {
        new_password: newPassword
      })
      onSuccess()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-xl font-bold mb-4">Reset Password</h3>
        <p className="text-gray-600 mb-4">
          Set a new password for <strong>{user.first_name} {user.last_name}</strong> ({user.email})
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => handlePasswordChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {newPassword && (
              <div className="mt-2">
                <div className="flex gap-1">
                  <div className={`h-1 flex-1 rounded ${passwordStrength === 'weak' ? 'bg-red-500' : passwordStrength === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                  <div className={`h-1 flex-1 rounded ${passwordStrength === 'medium' || passwordStrength === 'strong' ? 'bg-yellow-500' : 'bg-gray-200'}`}></div>
                  <div className={`h-1 flex-1 rounded ${passwordStrength === 'strong' ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {passwordStrength === 'strong' && 'Strong password'}
                  {passwordStrength === 'medium' && 'Medium strength - consider adding more characters'}
                  {passwordStrength === 'weak' && 'Weak password - please strengthen'}
                </p>
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-blue-800 font-medium mb-1">Password Requirements:</p>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• At least 12 characters long</li>
              <li>• One uppercase letter (A-Z)</li>
              <li>• One lowercase letter (a-z)</li>
              <li>• One number (0-9)</li>
              <li>• One special character (!@#$%^&*...)</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={loading || !newPassword || !confirmPassword}
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default memo(UserDetailsModal)