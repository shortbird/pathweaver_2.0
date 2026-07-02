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
  const [logoBusy, setLogoBusy] = useState(false)

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

  // First day of school (locks the family Schedule Builder). Saved on change.
  const [firstDay, setFirstDay] = useState(org.feature_flags?.sis_settings?.first_day_of_school || '')
  const [savingFirstDay, setSavingFirstDay] = useState(false)
  const saveFirstDay = async (value) => {
    setFirstDay(value)
    setSavingFirstDay(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...(org.feature_flags || {}),
          sis_settings: { ...(org.feature_flags?.sis_settings || {}), first_day_of_school: value || null },
        },
      })
      toast.success(value ? 'First day of school saved' : 'First day of school cleared')
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally { setSavingFirstDay(false) }
  }

  const saveDetails = async () => {
    if (!name.trim()) return toast.error('Name is required')
    if (!/^[a-z0-9-]+$/.test(slug)) return toast.error('Slug can only contain lowercase letters, numbers, and hyphens')
    setSavingDetails(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, { name: name.trim(), slug })
      toast.success('Organization updated')
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally { setSavingDetails(false) }
  }

  const uploadLogo = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Please pick an image file')
    if (file.size > 2 * 1024 * 1024) return toast.error('Image must be under 2MB')
    setLogoBusy(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await api.put(`/api/admin/organizations/${orgId}`, {
          branding_config: { ...org.branding_config, logo_url: reader.result },
        })
        setLogoUrl(reader.result)
        onUpdate && onUpdate()
        onLogoChange && onLogoChange()
      } catch (err) {
        toast.error(err.response?.data?.error || 'Failed to upload logo')
      } finally { setLogoBusy(false) }
    }
    reader.readAsDataURL(file)
  }

  const removeLogo = async () => {
    if (!window.confirm('Remove the organization logo?')) return
    setLogoBusy(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        branding_config: { ...org.branding_config, logo_url: null },
      })
      setLogoUrl('')
      onUpdate && onUpdate()
      onLogoChange && onLogoChange()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to remove logo')
    } finally { setLogoBusy(false) }
  }

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

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-neutral-500 mb-1">Name</label>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-neutral-500 mb-1">Slug <span className="text-neutral-400">(changes the registration URL)</span></label>
            <input className={`${field} font-mono`} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
          </div>
          <button onClick={saveDetails} disabled={savingDetails}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {savingDetails ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="flex items-center gap-4 mt-5 pt-5 border-t border-gray-100">
          <div className="w-16 h-16 rounded-lg border border-gray-200 bg-neutral-50 flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl
              ? <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
              : <span className="text-[10px] text-neutral-400 text-center px-1">No logo</span>}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-neutral-900">Logo</div>
            <div className="text-xs text-neutral-500 mb-1.5">Shown in the header for your organization's users. PNG or SVG, 2MB max.</div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-optio-purple hover:underline cursor-pointer">
                {logoBusy ? 'Working…' : logoUrl ? 'Change' : 'Upload'}
                <input type="file" accept="image/*" onChange={uploadLogo} disabled={logoBusy} className="hidden" />
              </label>
              {logoUrl && (
                <button onClick={removeLogo} disabled={logoBusy} className="text-sm text-red-500 hover:underline disabled:opacity-50">Remove</button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-5 pt-5 border-t border-gray-100">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-neutral-900">First day of school</div>
            <div className="text-xs text-neutral-500">
              Families can add, drop, and waitlist classes in the Schedule Builder until this date; after
              that, schedule changes are made by staff here. Leave blank to keep it open.
            </div>
          </div>
          <input
            type="date" value={firstDay} disabled={savingFirstDay}
            onChange={(e) => saveFirstDay(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple disabled:opacity-50"
          />
        </div>
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
