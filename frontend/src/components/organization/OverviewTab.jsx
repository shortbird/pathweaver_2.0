import React, { useState, useEffect } from 'react'
import { ChatBubbleLeftRightIcon, LightBulbIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'

const VALID_ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'parent', label: 'Parent' },
  { value: 'advisor', label: 'Advisor' },
  { value: 'org_admin', label: 'Organization Admin' },
  { value: 'observer', label: 'Observer' }
]

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
  const [logoUrl, setLogoUrl] = useState(orgData?.organization?.branding_config?.logo_url || '')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(orgData?.organization?.ai_features_enabled ?? true)
  const [savingAi, setSavingAi] = useState(false)

  // Granular AI feature toggles
  const [chatbotEnabled, setChatbotEnabled] = useState(orgData?.organization?.ai_chatbot_enabled ?? true)
  const [lessonHelperEnabled, setLessonHelperEnabled] = useState(orgData?.organization?.ai_lesson_helper_enabled ?? true)
  const [taskGenerationEnabled, setTaskGenerationEnabled] = useState(orgData?.organization?.ai_task_generation_enabled ?? true)
  const [savingFeature, setSavingFeature] = useState(false)

  // Invitation links state
  const [invitationLinks, setInvitationLinks] = useState([])
  const [linksLoading, setLinksLoading] = useState(true)
  const [generating, setGenerating] = useState(null)
  const [copiedLinkId, setCopiedLinkId] = useState(null)

  useEffect(() => {
    fetchInvitationLinks()
  }, [orgId])

  const fetchInvitationLinks = async () => {
    try {
      setLinksLoading(true)
      const response = await api.get(`/api/admin/organizations/${orgId}/invitations?status=pending`)
      const linkInvites = (response.data.invitations || []).filter(
        inv => inv.email?.startsWith('link-invite-') && inv.email?.endsWith('@pending.optio.local')
      )
      setInvitationLinks(linkInvites)
    } catch (err) {
      console.error('Failed to fetch invitation links:', err)
    } finally {
      setLinksLoading(false)
    }
  }

  const handleGenerateLink = async (role) => {
    setGenerating(role)
    try {
      const existingForRole = invitationLinks.find(l => l.role === role)
      if (existingForRole) {
        try {
          await api.delete(`/api/admin/organizations/${orgId}/invitations/${existingForRole.id}`)
        } catch (e) {
          console.warn('Failed to cancel old link:', e)
        }
      }
      await api.post(`/api/admin/organizations/${orgId}/invitations/link`, { role })
      await fetchInvitationLinks()
    } catch (err) {
      console.error('Failed to generate link:', err)
      alert(err.response?.data?.error || 'Failed to generate link')
    } finally {
      setGenerating(null)
    }
  }

  const handleCopyLink = async (code, id) => {
    const link = `${window.location.origin}/invitation/${code}`
    await navigator.clipboard.writeText(link)
    setCopiedLinkId(id)
    setTimeout(() => setCopiedLinkId(null), 2000)
  }

  const formatExpiration = (isoDate) => {
    const date = new Date(isoDate)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const getLinkForRole = (role) => invitationLinks.find(l => l.role === role)

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'org_admin': return 'bg-purple-100 text-purple-700'
      case 'advisor': return 'bg-blue-100 text-blue-700'
      case 'parent': return 'bg-green-100 text-green-700'
      case 'observer': return 'bg-yellow-100 text-yellow-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const policyLabels = {
    all_optio: 'All Optio Quests + Org Quests',
    curated: 'Curated Quests + Org Quests',
    private_only: 'Organization Quests Only'
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
      {/* Organization Details + Invitation Links Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        {/* Invitation Links */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold">Invitation Links</h2>
            <span className="text-xs text-gray-500">Share links to invite users</span>
          </div>

          {linksLoading ? (
            <div className="py-4 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple mx-auto"></div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {VALID_ROLES.map(({ value: role, label }) => {
                const existingLink = getLinkForRole(role)
                const isGenerating = generating === role

                return (
                  <div key={role} className="flex items-center justify-between py-2.5 gap-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium min-w-[90px] justify-center ${getRoleBadgeClass(role)}`}>
                      {label}
                    </span>

                    {existingLink ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs text-gray-400 truncate flex-1 font-mono">
                          .../{existingLink.invitation_code.slice(0, 12)}...
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:inline">
                          exp {formatExpiration(existingLink.expires_at)}
                        </span>
                        <button
                          onClick={() => handleCopyLink(existingLink.invitation_code, existingLink.id)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                            copiedLinkId === existingLink.id
                              ? 'bg-green-100 text-green-700'
                              : 'text-optio-purple hover:bg-optio-purple/10'
                          }`}
                        >
                          {copiedLinkId === existingLink.id ? 'Copied!' : 'Copy'}
                        </button>
                        <button
                          onClick={() => handleGenerateLink(role)}
                          disabled={isGenerating}
                          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                          title="Refresh link"
                        >
                          {isGenerating ? '...' : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGenerateLink(role)}
                        disabled={isGenerating}
                        className="text-xs text-gray-500 hover:text-optio-purple disabled:opacity-50 transition-colors"
                      >
                        {isGenerating ? 'Generating...' : '+ Generate'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Organization Logo + AI Features Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organization Logo */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold mb-2">Organization Logo</h2>
          <p className="text-gray-600 mb-4 text-sm">
            Your logo appears in the header for users in your organization.
          </p>

          {logoUrl ? (
            <div className="space-y-4">
              <div className="flex justify-center p-4 bg-gray-50 rounded-lg">
                <img
                  src={logoUrl}
                  alt="Organization logo"
                  className="max-h-32 max-w-full object-contain"
                />
              </div>
              <div className="flex items-center justify-center gap-3">
                <label className="px-3 py-1.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 cursor-pointer transition-colors text-sm">
                  {uploadingLogo ? 'Uploading...' : 'Change'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={handleRemoveLogo}
                  disabled={saving}
                  className="px-3 py-1.5 text-red-600 font-medium rounded-lg hover:bg-red-50 transition-colors text-sm"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                  <div className="text-center text-gray-400">
                    <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="flex-1">
                <label className="inline-block px-3 py-1.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 cursor-pointer transition-colors text-sm">
                  {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-gray-500 mt-2">
                  PNG or SVG, 2MB max
                </p>
              </div>
            </div>
          )}
        </div>

        {/* AI Features */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold mb-2">AI Features</h2>
          <p className="text-gray-600 mb-3 text-sm">
            Control AI-powered features for your organization.
          </p>

          {/* Master Toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900 text-sm">Enable AI Features</h3>
              <p className="text-xs text-gray-600">
                Master toggle for all AI functionality
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
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500 font-medium">Individual Features</p>

              <FeatureToggle
                label="AI Tutor"
                description="Educational conversations with AI"
                icon={ChatBubbleLeftRightIcon}
                enabled={chatbotEnabled}
                onToggle={() => handleToggleFeature('chatbot', chatbotEnabled, setChatbotEnabled)}
                disabled={savingFeature}
              />

              <FeatureToggle
                label="Lesson Helper"
                description="AI explains lesson concepts"
                icon={LightBulbIcon}
                enabled={lessonHelperEnabled}
                onToggle={() => handleToggleFeature('lesson_helper', lessonHelperEnabled, setLessonHelperEnabled)}
                disabled={savingFeature}
              />

              <FeatureToggle
                label="Task Suggestions"
                description="AI recommends tasks"
                icon={ClipboardDocumentListIcon}
                enabled={taskGenerationEnabled}
                onToggle={() => handleToggleFeature('task_generation', taskGenerationEnabled, setTaskGenerationEnabled)}
                disabled={savingFeature}
              />
            </div>
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
