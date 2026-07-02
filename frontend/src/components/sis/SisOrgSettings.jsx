import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

// Native SIS replacement for the legacy org SettingsTab: organization details +
// branding merged into one card, and every feature toggle (AI master/granular,
// bounty visibility) merged into another. Same endpoints as the legacy tab.

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const Toggle = ({ on, onClick, disabled }) => (
  <button
    type="button" role="switch" aria-checked={on} onClick={onClick} disabled={disabled}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
      on ? 'bg-optio-purple' : 'bg-neutral-300'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
)

const ToggleRow = ({ label, description, on, onClick, disabled, indent = false }) => (
  <div className={`flex items-center justify-between gap-4 py-3 ${indent ? 'pl-5' : ''}`}>
    <div className="min-w-0">
      <div className="text-sm font-medium text-neutral-900">{label}</div>
      {description && <div className="text-xs text-neutral-500">{description}</div>}
    </div>
    <Toggle on={on} onClick={onClick} disabled={disabled} />
  </div>
)

const SisOrgSettings = ({ orgId, orgData, onUpdate, onLogoChange }) => {
  const org = orgData?.organization || {}
  const [name, setName] = useState(org.name || '')
  const [slug, setSlug] = useState(org.slug || '')
  const [savingDetails, setSavingDetails] = useState(false)
  const [logoUrl, setLogoUrl] = useState(org.branding_config?.logo_url || '')
  // Logo edits are staged and saved with the Save button alongside name/slug.
  // undefined = unchanged, data-URL string = new logo, null = remove.
  const [pendingLogo, setPendingLogo] = useState(undefined)

  const [aiEnabled, setAiEnabled] = useState(org.ai_features_enabled ?? true)
  const [chatbot, setChatbot] = useState(org.ai_chatbot_enabled ?? true)
  const [lessonHelper, setLessonHelper] = useState(org.ai_lesson_helper_enabled ?? true)
  const [taskGen, setTaskGen] = useState(org.ai_task_generation_enabled ?? true)
  // Stored inverted (hide_public_bounties); presented positively as "Public bounties".
  const [showPublicJobs, setShowPublicJobs] = useState(!(org.feature_flags?.hide_public_bounties ?? false))
  // At-home learning: whether Optio platform courses appear in the family Schedule Builder.
  const [optioCourses, setOptioCourses] = useState(org.feature_flags?.sis_settings?.optio_courses_enabled ?? true)
  const [savingToggle, setSavingToggle] = useState(false)

  // One org-wide price for ALL Optio courses (dollars in the input, cents in storage).
  const storedTuition = org.feature_flags?.sis_settings?.optio_course_tuition_cents
  const [courseTuition, setCourseTuition] = useState(storedTuition != null ? String(storedTuition / 100) : '')
  const [savingTuition, setSavingTuition] = useState(false)
  const saveCourseTuition = async () => {
    const cents = courseTuition === '' ? null : Math.round(Number(courseTuition) * 100)
    if (cents === (storedTuition ?? null)) return
    if (cents != null && (Number.isNaN(cents) || cents < 0)) return toast.error('Enter a valid tuition amount')
    setSavingTuition(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...(org.feature_flags || {}),
          sis_settings: { ...(org.feature_flags?.sis_settings || {}), optio_course_tuition_cents: cents },
        },
      })
      toast.success(cents != null ? 'Optio course tuition saved' : 'Optio course tuition cleared')
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally { setSavingTuition(false) }
  }

  const saveDetails = async () => {
    if (!name.trim()) return toast.error('Name is required')
    if (!/^[a-z0-9-]+$/.test(slug)) return toast.error('Slug can only contain lowercase letters, numbers, and hyphens')
    setSavingDetails(true)
    try {
      const payload = { name: name.trim(), slug }
      if (pendingLogo !== undefined) {
        payload.branding_config = { ...org.branding_config, logo_url: pendingLogo }
      }
      await api.put(`/api/admin/organizations/${orgId}`, payload)
      if (pendingLogo !== undefined) {
        setLogoUrl(pendingLogo || '')
        setPendingLogo(undefined)
        onLogoChange && onLogoChange()
      }
      toast.success('Organization updated')
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally { setSavingDetails(false) }
  }

  const pickLogo = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Please pick an image file')
    if (file.size > 2 * 1024 * 1024) return toast.error('Image must be under 2MB')
    const reader = new FileReader()
    reader.onload = () => setPendingLogo(reader.result)
    reader.readAsDataURL(file)
  }

  // What the logo box shows right now: the staged change, else the saved logo.
  const shownLogo = pendingLogo !== undefined ? pendingLogo : logoUrl

  const toggleAiMaster = async () => {
    setSavingToggle(true)
    try {
      await api.post(`/api/admin/organizations/${orgId}/ai-access`, { enabled: !aiEnabled })
      setAiEnabled(!aiEnabled)
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update AI settings')
    } finally { setSavingToggle(false) }
  }

  const toggleField = async (payload, apply) => {
    setSavingToggle(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, payload)
      apply()
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update setting')
    } finally { setSavingToggle(false) }
  }

  return (
    <>
      {/* Organization: details + branding in one card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="text-lg font-semibold text-neutral-900">Organization</h2>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
            org.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
          }`}>{org.is_active ? 'Active' : 'Inactive'}</span>
        </div>
        <p className="text-sm text-neutral-500 mb-4">Name, registration URL, and the logo your families see.</p>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="shrink-0">
            <label className="block text-xs font-medium text-neutral-500 mb-1">Logo</label>
            <div className="flex items-end gap-2">
              <div className="w-[38px] h-[38px] rounded-lg border border-gray-200 bg-neutral-50 flex items-center justify-center overflow-hidden"
                title="Shown in the header for your organization's users. PNG or SVG, 2MB max.">
                {shownLogo
                  ? <img src={shownLogo} alt="Logo" className="max-w-full max-h-full object-contain" />
                  : <span className="text-[9px] text-neutral-400 text-center px-0.5">None</span>}
              </div>
              <div className="flex flex-col justify-end leading-tight pb-0.5">
                <label className="text-xs font-medium text-optio-purple hover:underline cursor-pointer">
                  {shownLogo ? 'Change' : 'Upload'}
                  <input type="file" accept="image/*" onChange={pickLogo} className="hidden" />
                </label>
                {shownLogo && (
                  <button onClick={() => setPendingLogo(null)} className="text-xs text-red-500 hover:underline text-left">Remove</button>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-neutral-500 mb-1">Name</label>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-neutral-500 mb-1">Slug <span className="text-neutral-400">(changes the registration URL)</span></label>
            <input className={`${field} font-mono`} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
          </div>
          <button onClick={saveDetails} disabled={savingDetails}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {savingDetails ? 'Saving…' : 'Save'}
          </button>
        </div>
        {pendingLogo !== undefined && (
          <p className="text-xs text-amber-600 mt-1.5">
            {pendingLogo ? 'New logo selected' : 'Logo will be removed'} — click Save to apply.
          </p>
        )}

      </div>

      {/* Features: AI + School Jobs in one toggle list */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">Features</h2>
        <p className="text-sm text-neutral-500 mb-2">What's available to your organization's students.</p>

        <div className="divide-y divide-gray-100">
          <ToggleRow
            label="AI features"
            description="Master switch for all AI functionality"
            on={aiEnabled} onClick={toggleAiMaster} disabled={savingToggle}
          />
          {aiEnabled && (
            <>
              <ToggleRow indent label="AI Tutor" description="Educational conversations with AI"
                on={chatbot} disabled={savingToggle}
                onClick={() => toggleField({ ai_chatbot_enabled: !chatbot }, () => setChatbot(!chatbot))} />
              <ToggleRow indent label="Lesson Helper" description="AI explains lesson concepts"
                on={lessonHelper} disabled={savingToggle}
                onClick={() => toggleField({ ai_lesson_helper_enabled: !lessonHelper }, () => setLessonHelper(!lessonHelper))} />
              <ToggleRow indent label="Task Suggestions" description="AI recommends tasks"
                on={taskGen} disabled={savingToggle}
                onClick={() => toggleField({ ai_task_generation_enabled: !taskGen }, () => setTaskGen(!taskGen))} />
            </>
          )}
          <ToggleRow
            label="Optio courses"
            description="Families can add Optio courses as at-home learning in the Schedule Builder"
            on={optioCourses} disabled={savingToggle}
            onClick={() => toggleField(
              { feature_flags: {
                ...(org.feature_flags || {}),
                sis_settings: { ...(org.feature_flags?.sis_settings || {}), optio_courses_enabled: !optioCourses },
              } },
              () => setOptioCourses(!optioCourses),
            )}
          />
          {optioCourses && (
            <div className="flex items-center justify-between pl-6 py-2">
              <div>
                <p className="text-sm font-medium text-neutral-800">Optio course tuition</p>
                <p className="text-xs text-neutral-500">One price parents are charged for any Optio course. Leave blank for none.</p>
              </div>
              <div className="relative w-32 shrink-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="number" min={0} step="0.01" placeholder="0.00"
                  aria-label="Optio course tuition"
                  value={courseTuition} disabled={savingTuition}
                  onChange={(e) => setCourseTuition(e.target.value)}
                  onBlur={saveCourseTuition}
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent disabled:opacity-50"
                />
              </div>
            </div>
          )}
          <ToggleRow
            label="Public bounties"
            description="Students also see the platform-wide public bounty board. Bounties your organization posts always show."
            on={showPublicJobs} disabled={savingToggle}
            onClick={() => toggleField(
              { feature_flags: { ...(org.feature_flags || {}), hide_public_bounties: showPublicJobs } },
              () => setShowPublicJobs(!showPublicJobs),
            )}
          />
        </div>
      </div>
    </>
  )
}

export default SisOrgSettings
