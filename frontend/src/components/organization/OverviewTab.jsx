import React, { useState, useEffect } from 'react'
import { ChatBubbleLeftRightIcon, LightBulbIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'

function EditOrganizationModal({ orgId, orgData, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: orgData?.organization?.name || '',
    slug: orgData?.organization?.slug || ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await api.put(`/api/admin/organizations/${orgId}`, formData)
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update organization')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Edit Organization</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              pattern="[a-z0-9-]+"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, hyphens only. This changes the registration URL.</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function OverviewTab({ orgId, orgData, onUpdate, onLogoChange }) {
  const [showEditModal, setShowEditModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [logoUrl, setLogoUrl] = useState(orgData?.organization?.branding_config?.logo_url || '')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [aiEnabled, setAiEnabled] = useState(orgData?.organization?.ai_features_enabled ?? true)
  const [savingAi, setSavingAi] = useState(false)

  // Granular AI feature toggles
  const [chatbotEnabled, setChatbotEnabled] = useState(orgData?.organization?.ai_chatbot_enabled ?? true)
  const [lessonHelperEnabled, setLessonHelperEnabled] = useState(orgData?.organization?.ai_lesson_helper_enabled ?? true)
  const [taskGenerationEnabled, setTaskGenerationEnabled] = useState(orgData?.organization?.ai_task_generation_enabled ?? true)
  const [savingFeature, setSavingFeature] = useState(false)

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const { data } = await api.get(`/api/admin/organizations/${orgId}/analytics`)
        setAnalytics(data)
      } catch (error) {
        console.error('Failed to fetch analytics:', error)
        setAnalytics({ total_users: 0, total_completions: 0, total_xp: 0 })
      } finally {
        setAnalyticsLoading(false)
      }
    }
    fetchAnalytics()
  }, [orgId])

  const policyLabels = {
    all_optio: 'All Optio Quests + Org Quests',
    curated: 'Curated Quests + Org Quests',
    private_only: 'Organization Quests Only'
  }

  const registrationUrl = `${window.location.origin}/join/${orgData.organization.slug}`

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(registrationUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be less than 2MB')
      return
    }

    setUploadingLogo(true)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const base64 = reader.result
          await api.put(`/api/admin/organizations/${orgId}`, {
            branding_config: {
              ...orgData?.organization?.branding_config,
              logo_url: base64
            }
          })
          setLogoUrl(base64)
          onUpdate()
          if (onLogoChange) onLogoChange()
        } catch (error) {
          console.error('Failed to upload logo:', error)
          alert(error.response?.data?.error || 'Failed to upload logo')
        } finally {
          setUploadingLogo(false)
        }
      }
      reader.readAsDataURL(file)
    } catch (error) {
      console.error('Failed to read file:', error)
      setUploadingLogo(false)
    }
  }

  const handleRemoveLogo = async () => {
    if (!confirm('Remove organization logo?')) return

    setSaving(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        branding_config: {
          ...orgData?.organization?.branding_config,
          logo_url: null
        }
      })
      setLogoUrl('')
      onUpdate()
      if (onLogoChange) onLogoChange()
    } catch (error) {
      console.error('Failed to remove logo:', error)
      alert(error.response?.data?.error || 'Failed to remove logo')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleAi = async () => {
    const newValue = !aiEnabled
    setSavingAi(true)
    try {
      await api.post(`/api/admin/organizations/${orgId}/ai-access`, {
        enabled: newValue
      })
      setAiEnabled(newValue)
      onUpdate()
    } catch (error) {
      console.error('Failed to toggle AI access:', error)
      alert(error.response?.data?.error || 'Failed to update AI settings')
    } finally {
      setSavingAi(false)
    }
  }

  const handleToggleFeature = async (feature, currentValue, setter) => {
    const newValue = !currentValue
    setSavingFeature(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        [`ai_${feature}_enabled`]: newValue
      })
      setter(newValue)
      onUpdate()
    } catch (error) {
      console.error(`Failed to toggle ${feature}:`, error)
      alert(error.response?.data?.error || 'Failed to update AI feature')
    } finally {
      setSavingFeature(false)
    }
  }

  const FeatureToggle = ({ label, description, icon: Icon, enabled, onToggle, disabled }) => (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-optio-purple/10">
          <Icon className="w-5 h-5 text-optio-purple" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-gray-900">{label}</span>
            <button
              onClick={onToggle}
              disabled={disabled}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                enabled ? 'bg-optio-purple' : 'bg-gray-300'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="grid gap-6">
      {/* Organization Details */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
          <h2 className="text-xl font-bold">Organization Details</h2>
          <button
            onClick={() => setShowEditModal(true)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Edit
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="font-medium text-gray-600">Name</dt>
            <dd className="text-lg">{orgData.organization.name}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">Slug</dt>
            <dd className="text-lg font-mono">{orgData.organization.slug}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">Quest Visibility Policy</dt>
            <dd className="text-lg">{policyLabels[orgData.organization.quest_visibility_policy]}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">Status</dt>
            <dd className="text-lg">
              {orgData.organization.is_active ? (
                <span className="text-green-600">Active</span>
              ) : (
                <span className="text-red-600">Inactive</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Registration URL */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-2">Registration URL</h2>
        <p className="text-gray-600 mb-4">Share this link with users to join your organization.</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 font-mono text-sm text-gray-700 truncate">
            {registrationUrl}
          </div>
          <button
            onClick={handleCopyUrl}
            className={`px-4 py-3 font-medium rounded-lg transition-all ${
              copied
                ? 'bg-green-100 text-green-700'
                : 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90'
            }`}
          >
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
        </div>
      </div>

      {/* Organization Logo */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-2">Organization Logo</h2>
        <p className="text-gray-600 mb-4">
          Your logo appears in the header for users in your organization.
        </p>

        <div className="flex items-start gap-6">
          <div className="flex-shrink-0">
            <div className="w-32 h-32 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Organization logo"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="text-center text-gray-400">
                  <svg className="w-10 h-10 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs">No logo</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap gap-3">
              <label className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 cursor-pointer transition-colors">
                {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploadingLogo}
                  className="hidden"
                />
              </label>
              {logoUrl && (
                <button
                  onClick={handleRemoveLogo}
                  disabled={saving}
                  className="px-4 py-2 text-red-600 font-medium rounded-lg hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-3">
              Requirements: PNG or SVG format, 2MB max
            </p>
          </div>
        </div>
      </div>

      {/* AI Features */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-2">AI Features</h2>
        <p className="text-gray-600 mb-4">
          Control access to AI-powered features for all users in your organization.
        </p>

        {/* Master Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <h3 className="font-medium text-gray-900">Enable AI Features</h3>
            <p className="text-sm text-gray-600 mt-1">
              Master toggle for all AI functionality. Uses Google's Gemini API.
            </p>
          </div>
          <button
            onClick={handleToggleAi}
            disabled={savingAi}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              aiEnabled ? 'bg-optio-purple' : 'bg-gray-300'
            } ${savingAi ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                aiEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Granular Controls - only shown when master toggle is ON */}
        {aiEnabled && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-gray-500 font-medium">Individual Features</p>

            <FeatureToggle
              label="AI Tutor"
              description="Students can have educational conversations with an AI tutor."
              icon={ChatBubbleLeftRightIcon}
              enabled={chatbotEnabled}
              onToggle={() => handleToggleFeature('chatbot', chatbotEnabled, setChatbotEnabled)}
              disabled={savingFeature}
            />

            <FeatureToggle
              label="Lesson Helper"
              description="AI assistance within lessons to explain concepts."
              icon={LightBulbIcon}
              enabled={lessonHelperEnabled}
              onToggle={() => handleToggleFeature('lesson_helper', lessonHelperEnabled, setLessonHelperEnabled)}
              disabled={savingFeature}
            />

            <FeatureToggle
              label="Task Suggestions"
              description="AI recommends tasks and provides quest feedback."
              icon={ClipboardDocumentListIcon}
              enabled={taskGenerationEnabled}
              onToggle={() => handleToggleFeature('task_generation', taskGenerationEnabled, setTaskGenerationEnabled)}
              disabled={savingFeature}
            />
          </div>
        )}

        <p className="text-sm text-gray-500 mt-3">
          {aiEnabled
            ? 'AI features are enabled. Parents can still control access for individual children.'
            : 'AI features are disabled for all users in this organization.'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total Users</h3>
          {analyticsLoading ? (
            <div className="h-9 w-16 bg-gray-200 rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold">{analytics?.total_users ?? 0}</p>
          )}
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Quest Completions</h3>
          {analyticsLoading ? (
            <div className="h-9 w-16 bg-gray-200 rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold">{analytics?.total_completions ?? 0}</p>
          )}
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total XP Earned</h3>
          {analyticsLoading ? (
            <div className="h-9 w-16 bg-gray-200 rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold">{(analytics?.total_xp ?? 0).toLocaleString()}</p>
          )}
        </div>
      </div>

      {showEditModal && (
        <EditOrganizationModal
          orgId={orgId}
          orgData={orgData}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false)
            onUpdate()
          }}
        />
      )}
    </div>
  )
}
