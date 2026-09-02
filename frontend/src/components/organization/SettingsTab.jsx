import React, { useState, useEffect, useCallback } from 'react'
import { ChatBubbleLeftRightIcon, LightBulbIcon, ClipboardDocumentListIcon, SparklesIcon, PrinterIcon, FlagIcon, Squares2X2Icon } from '@heroicons/react/24/outline'
import api, { oeaAPI } from '../../services/api'
import { getProgramForSlug } from '../../programs/registry'
import SchoolLoginLinkCard from './SchoolLoginLinkCard'

function EditOrganizationModal({ orgId, orgData, onClose, onSuccess, canEditSlug }) {
  const currentSlug = orgData?.organization?.slug || ''
  const [formData, setFormData] = useState({
    name: orgData?.organization?.name || '',
    slug: currentSlug
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const slugChanged = canEditSlug && formData.slug !== currentSlug

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Only superadmin may rename the slug; sending it otherwise is dropped
      // server-side, which reads as a silent failure.
      const payload = slugChanged ? formData : { name: formData.name }
      await api.put(`/api/admin/organizations/${orgId}`, payload)
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
              className="w-full border border-gray-200 rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none disabled:bg-gray-50 disabled:text-gray-500"
              pattern="[a-z0-9-]+"
              disabled={!canEditSlug}
              required
            />
            {canEditSlug ? (
              <p className="text-xs text-gray-500 mt-1">
                Lowercase letters, numbers, hyphens only. The school login link becomes
                <span className="font-mono"> /login/{formData.slug || '...'}</span>.
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                The slug sets the school login link and can only be changed by Optio staff.
              </p>
            )}
            {slugChanged && (
              <p className="text-xs text-amber-700 mt-1">
                Renaming breaks the old login link and any printed QR codes. Share the new
                link and reprint after saving.
              </p>
            )}
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
              className="px-4 py-2 bg-gradient-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SettingsTab({ orgId, orgData, onUpdate, onLogoChange, canEditSlug = false }) {
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

  // L1: hide platform-wide public bounties so students see only org/cohort School Jobs.
  const [hidePublicBounties, setHidePublicBounties] = useState(
    orgData?.organization?.feature_flags?.hide_public_bounties ?? false
  )
  const [savingBounties, setSavingBounties] = useState(false)

  // Restrict task XP to teachers. Off by default -- students sizing their own work
  // is the platform default; schools opt in when self-awarded XP gets inflated.
  // Enforced server-side in backend/utils/xp_permissions.py.
  const [lockXpEditing, setLockXpEditing] = useState(
    orgData?.organization?.feature_flags?.lock_xp_editing ?? false
  )
  const [savingXpLock, setSavingXpLock] = useState(false)

  const handleToggleLockXpEditing = async () => {
    const newValue = !lockXpEditing
    setSavingXpLock(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: { ...(orgData?.organization?.feature_flags || {}), lock_xp_editing: newValue },
      })
      setLockXpEditing(newValue)
      onUpdate()
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update XP setting')
    } finally {
      setSavingXpLock(false)
    }
  }

  // Weekly XP goals. Off by default -- a target is a commitment a school makes
  // to its families, not something to switch on for them. Enforced server-side
  // in backend/services/xp_goal_service.py.
  const [xpGoals, setXpGoals] = useState(
    orgData?.organization?.feature_flags?.xp_goals ?? false
  )
  const [savingXpGoals, setSavingXpGoals] = useState(false)

  const handleToggleXpGoals = async () => {
    const newValue = !xpGoals
    setSavingXpGoals(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: { ...(orgData?.organization?.feature_flags || {}), xp_goals: newValue },
      })
      setXpGoals(newValue)
      onUpdate()
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update XP goals setting')
    } finally {
      setSavingXpGoals(false)
    }
  }

  // Optio's five pillars (STEM / Wellness / Communication / Civics / Art). On by
  // default. A school that already classifies work by school subject is asking
  // families to label the same task twice, so it can switch the pillars off:
  // every picker, badge and breakdown disappears and the diploma credit stands
  // alone. Nothing is deleted — the pillar is still recorded, derived from the
  // credit (backend/utils/school_subjects.py::pillar_for_subject) — so turning
  // it back on restores the full view. Hearthwood Academy asked for this after a
  // parent wrote in that the pillars were impossible to make sense of
  // (2026-08-25).
  const [hidePillars, setHidePillars] = useState(
    orgData?.organization?.feature_flags?.hide_pillars ?? false
  )
  const [savingPillars, setSavingPillars] = useState(false)

  const handleToggleHidePillars = async () => {
    const newValue = !hidePillars
    setSavingPillars(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: { ...(orgData?.organization?.feature_flags || {}), hide_pillars: newValue },
      })
      setHidePillars(newValue)
      onUpdate()
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update the pillars setting')
    } finally {
      setSavingPillars(false)
    }
  }

  // Program getting-started video (diploma programs opt in via the program
  // registry's helpVideoConfigurable flag). Parents see the video card on the
  // program landing page; while unset they see a "coming soon" placeholder.
  const program = getProgramForSlug(orgData?.organization?.slug)
  const [helpVideoUrl, setHelpVideoUrl] = useState(
    orgData?.organization?.feature_flags?.oea_settings?.help_video_url || ''
  )
  const [savingVideo, setSavingVideo] = useState(false)
  const handleSaveHelpVideo = async () => {
    const url = helpVideoUrl.trim()
    if (url && !/^https?:\/\//i.test(url)) {
      alert('Enter a full URL starting with http:// or https:// (or leave empty to remove the video).')
      return
    }
    setSavingVideo(true)
    try {
      const flags = orgData?.organization?.feature_flags || {}
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...flags,
          oea_settings: { ...(flags.oea_settings || {}), help_video_url: url || null },
        },
      })
      onUpdate()
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save the video URL')
    } finally {
      setSavingVideo(false)
    }
  }

  // Who has opened the video. The video is hosted off-platform and opens in a
  // new tab, so this counts the click and nothing more — the copy says "opened",
  // never "watched", because playback is not something the platform can see.
  const [videoViews, setVideoViews] = useState(null)
  const [showVideoViewers, setShowVideoViewers] = useState(false)
  const loadVideoViews = useCallback(async () => {
    try {
      const { data } = await oeaAPI.helpVideoViews()
      setVideoViews(data)
    } catch {
      setVideoViews(null)
    }
  }, [])
  useEffect(() => {
    if (program?.helpVideoConfigurable) loadVideoViews()
  }, [program?.helpVideoConfigurable, loadVideoViews])
  // Where the video is hosted, for the "we can't see playback" note. A saved URL
  // is validated as http(s) on the way in, but this renders inside the card, so
  // a bad one must degrade rather than blank the settings page.
  let videoHost = null
  try {
    if (videoViews?.help_video_url) {
      videoHost = new URL(videoViews.help_video_url).hostname.replace(/^www\./, '')
    }
  } catch { /* unparseable URL — fall back to the generic wording */ }

  // Step printing: schools with a kiosk receipt printer opt in to a "Print my
  // steps" button on the AI step breakdown (TaskStepsModal). Off by default.
  const [stepPrinting, setStepPrinting] = useState(
    orgData?.organization?.feature_flags?.step_printing ?? false
  )
  const [savingStepPrinting, setSavingStepPrinting] = useState(false)

  const handleToggleStepPrinting = async () => {
    const newValue = !stepPrinting
    setSavingStepPrinting(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: { ...(orgData?.organization?.feature_flags || {}), step_printing: newValue },
      })
      setStepPrinting(newValue)
      onUpdate()
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update step printing setting')
    } finally {
      setSavingStepPrinting(false)
    }
  }

  const handleToggleHidePublicBounties = async () => {
    const newValue = !hidePublicBounties
    setSavingBounties(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: { ...(orgData?.organization?.feature_flags || {}), hide_public_bounties: newValue },
      })
      setHidePublicBounties(newValue)
      onUpdate()
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update School Jobs setting')
    } finally {
      setSavingBounties(false)
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

      {/* School Login Link + QR */}
      <SchoolLoginLinkCard slug={orgData.organization.slug} />

      {/* Organization Logo + AI Features Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organization Logo */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold mb-2">Branding</h2>
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

      {/* Program getting-started video (diploma programs only) */}
      {program?.helpVideoConfigurable && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold mb-2">Getting-started video</h2>
          <p className="text-gray-600 mb-4 text-sm">
            Shown to parents on the {program.name} page and course tracker. Until a URL is
            saved, parents see a "video coming soon" placeholder. Paste a link to your hosted
            video (YouTube, Vimeo, Loom, etc.) — leave empty and save to remove it.
          </p>
          <div className="flex gap-3">
            <input
              type="url"
              value={helpVideoUrl}
              onChange={(e) => setHelpVideoUrl(e.target.value)}
              placeholder="https://..."
              aria-label="Getting-started video URL"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
            />
            <button
              onClick={handleSaveHelpVideo}
              disabled={savingVideo}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-gradient-primary disabled:opacity-50"
            >
              {savingVideo ? 'Saving...' : 'Save'}
            </button>
          </div>

          {videoViews?.help_video_url && videoViews.parent_count > 0 && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {videoViews.opened_count} of {videoViews.parent_count} parents have opened it
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Counts parents who clicked through to the video. It plays
                    {videoHost ? ` on ${videoHost}` : ' off-platform'}, so we can't tell how
                    much of it they watched.
                  </p>
                </div>
                <button
                  onClick={() => setShowVideoViewers((v) => !v)}
                  className="shrink-0 text-sm font-medium text-optio-purple"
                >
                  {showVideoViewers ? 'Hide list' : 'See who'}
                </button>
              </div>

              <div className="mt-3 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full bg-gradient-primary rounded-full"
                  style={{ width: `${Math.round((videoViews.opened_count / videoViews.parent_count) * 100)}%` }}
                />
              </div>

              {showVideoViewers && (
                <ul className="mt-3 max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
                  {videoViews.parents.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block text-sm text-gray-900 truncate">{p.name}</span>
                        <span className="block text-xs text-gray-500 truncate">{p.email}</span>
                      </span>
                      <span className={`shrink-0 text-xs ${p.opened ? 'text-gray-500' : 'text-amber-600 font-medium'}`}>
                        {p.opened
                          ? `Opened ${new Date(p.first_opened_at).toLocaleDateString()}`
                          : 'Not opened'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* School Jobs (bounty board) settings */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-2">School Jobs</h2>
        <FeatureToggle
          label="Hide public School Jobs"
          description="Only show jobs posted by your organization (hide the platform-wide public bounty board from your students)."
          icon={ClipboardDocumentListIcon}
          enabled={hidePublicBounties}
          onToggle={handleToggleHidePublicBounties}
          disabled={savingBounties}
        />
      </div>

      {/* Step printing (kiosk receipt printer) */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-2">Printing</h2>
        <FeatureToggle
          label="Print task steps"
          description="Adds a Print button to the AI step breakdown so students can print their checklist and carry it to a work station. Formatted for an 80mm receipt printer; works on any printer the device can reach."
          icon={PrinterIcon}
          enabled={stepPrinting}
          onToggle={handleToggleStepPrinting}
          disabled={savingStepPrinting}
        />
      </div>

      {/* How work is classified */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-2">Pillars</h2>
        <FeatureToggle
          label="Hide the five pillars"
          description="Turns off STEM / Wellness / Communication / Civics / Art everywhere your families and students see them — the picker when they create a task, the badges on tasks and evidence, and the pillar chart on the profile. Tasks are then classified only by the diploma credit they count toward. Nothing is lost: pillars come back exactly as they were if you switch this off."
          icon={Squares2X2Icon}
          enabled={hidePillars}
          onToggle={handleToggleHidePillars}
          disabled={savingPillars}
        />
      </div>

      {/* XP policy */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-2">XP</h2>
        <FeatureToggle
          label="Only teachers can set task XP"
          description="Students keep creating and editing their own tasks, but the XP value is set by the platform and can only be changed by teachers and org admins. Leave off to let students size their own work."
          icon={SparklesIcon}
          enabled={lockXpEditing}
          onToggle={handleToggleLockXpEditing}
          disabled={savingXpLock}
        />
        <FeatureToggle
          label="Weekly XP goals"
          description="Lets students, parents, and teachers set a weekly XP target that shows on the student's profile with live progress. Off by default; the goal is a target, not a grade."
          icon={FlagIcon}
          enabled={xpGoals}
          onToggle={handleToggleXpGoals}
          disabled={savingXpGoals}
        />
      </div>

      {showEditModal && (
        <EditOrganizationModal
          orgId={orgId}
          orgData={orgData}
          canEditSlug={canEditSlug}
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
