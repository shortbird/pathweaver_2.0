import React, { useState, useEffect, memo } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

const UserDetailsModal = ({ user, onClose, onSave }) => {
  const [activeTab, setActiveTab] = useState('profile')
  const [formData, setFormData] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    email: user.email || '',
    role: user.role || 'student',
    subscription_tier: user.subscription_tier || 'free',
    subscription_expires: user.subscription_expires || ''
  })
  const [roleChangeReason, setRoleChangeReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [userActivity, setUserActivity] = useState(null)

  useEffect(() => {
    fetchUserDetails()
  }, [user.id])

  const fetchUserDetails = async () => {
    try {
      const response = await api.get(`/api/v3/admin/users/${user.id}`)
      setUserActivity(response.data)
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
      await api.put(`/api/v3/admin/users/${user.id}`, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email
      })
      toast.success('Profile updated successfully')
      onSave()
    } catch (error) {
      toast.error('Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateSubscription = async () => {
    const tierDisplayNames = {
      free: 'Free',
      supported: 'Supported',
      academy: 'Academy'
    };
    const displayName = tierDisplayNames[formData.subscription_tier] || formData.subscription_tier;
    if (window.confirm(`Change subscription to ${displayName}?`)) {
      setLoading(true)
      try {
        await api.post(`/api/v3/admin/users/${user.id}/subscription`, {
          subscription_tier: formData.subscription_tier,
          expires: formData.subscription_expires
        })
        toast.success('Subscription updated successfully')
        onSave()
      } catch (error) {
        toast.error('Failed to update subscription')
      } finally {
        setLoading(false)
      }
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
        await api.put(`/api/v3/admin/users/${user.id}/role`, {
          role: formData.role,
          reason: roleChangeReason || 'Role change requested by admin'
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

  const getPillarColor = (pillar) => {
    const colors = {
      creativity: 'bg-purple-100 text-purple-700',
      critical_thinking: 'bg-blue-100 text-blue-700',
      practical_skills: 'bg-green-100 text-green-700',
      communication: 'bg-orange-100 text-orange-700',
      cultural_literacy: 'bg-red-100 text-red-700'
    }
    return colors[pillar] || 'bg-gray-100 text-gray-700'
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
          {['profile', 'role', 'subscription', 'activity'].map((tab) => (
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    User ID
                  </label>
                  <input
                    type="text"
                    value={user.id}
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Created At
                  </label>
                  <input
                    type="text"
                    value={new Date(user.created_at).toLocaleString()}
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Change (Optional)
                </label>
                <textarea
                  value={roleChangeReason}
                  onChange={(e) => setRoleChangeReason(e.target.value)}
                  placeholder="Enter reason for role change..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                />
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
                className={`w-full py-2 rounded-lg ${
                  formData.role === (user.role || 'student')
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                } disabled:bg-gray-400`}
              >
                {loading ? 'Updating...' : 'Update Role'}
              </button>
            </div>
          )}

          {activeTab === 'subscription' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subscription Tier
                </label>
                <select
                  name="subscription_tier"
                  value={formData.subscription_tier}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="free">Free</option>
                  <option value="supported">Supported ($39.99/month)</option>
                  <option value="academy">Academy ($499.99/month)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subscription Expires
                </label>
                <input
                  type="datetime-local"
                  name="subscription_expires"
                  value={formData.subscription_expires}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Leave empty for free tier or lifetime access
                </p>
              </div>
              <button
                onClick={handleUpdateSubscription}
                disabled={loading}
                className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
              >
                {loading ? 'Updating...' : 'Update Subscription'}
              </button>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-6">
              {/* XP by Pillar */}
              <div>
                <h3 className="text-lg font-semibold mb-3">XP by Pillar</h3>
                {userActivity?.xp_by_pillar ? (
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(userActivity.xp_by_pillar).map(([pillar, xp]) => (
                      <div key={pillar} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className={`px-2 py-1 rounded text-sm font-medium ${getPillarColor(pillar)}`}>
                          {pillar.replace('_', ' ')}
                        </span>
                        <span className="font-bold text-gray-700">{xp} XP</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No XP data available</p>
                )}
              </div>

              {/* Recent Completed Quests */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Recent Completed Quests</h3>
                {userActivity?.completed_quests?.length > 0 ? (
                  <div className="space-y-2">
                    {userActivity.completed_quests.slice(0, 5).map((quest) => (
                      <div key={quest.id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900">{quest.title}</p>
                            <p className="text-sm text-gray-500">
                              Completed: {new Date(quest.completed_at).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="text-sm font-bold text-green-600">
                            +{quest.xp_earned} XP
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No completed quests</p>
                )}
              </div>

              {/* Statistics */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Statistics</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Total XP</p>
                    <p className="text-xl font-bold text-gray-900">{userActivity?.total_xp || 0}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Quests Completed</p>
                    <p className="text-xl font-bold text-gray-900">{userActivity?.quests_completed || 0}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Last Active</p>
                    <p className="text-sm font-medium text-gray-900">
                      {userActivity?.last_active
                        ? new Date(userActivity.last_active).toLocaleDateString()
                        : 'Never'}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Streak</p>
                    <p className="text-xl font-bold text-gray-900">{userActivity?.current_streak || 0} days</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(UserDetailsModal)