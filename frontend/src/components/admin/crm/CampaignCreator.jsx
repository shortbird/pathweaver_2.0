import React, { useState, useEffect } from 'react'
import { crmAPI } from '../../../services/crmAPI'
import toast from 'react-hot-toast'

const CampaignCreator = ({ campaign, onClose, onSave }) => {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    name: '',
    campaign_type: 'manual',
    template_key: '',
    segment_id: null,
    filter_rules: {},
    scheduled_for: '',
    trigger_event: '',
    trigger_delay_hours: 0
  })
  const [templates, setTemplates] = useState([])
  const [segments, setSegments] = useState([])
  const [previewCount, setPreviewCount] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchTemplates()
    fetchSegments()
    if (campaign) {
      setFormData({
        ...campaign,
        scheduled_for: campaign.scheduled_for ? campaign.scheduled_for.slice(0, 16) : ''
      })
    }
  }, [campaign])

  useEffect(() => {
    if (formData.filter_rules && Object.keys(formData.filter_rules).length > 0) {
      previewSegment()
    }
  }, [formData.filter_rules])

  const fetchTemplates = async () => {
    try {
      const response = await crmAPI.getTemplates(true)
      setTemplates(response.data.templates || [])
    } catch (error) {
      console.error('Failed to load templates:', error)
      setTemplates([])
    }
  }

  const fetchSegments = async () => {
    try {
      const response = await crmAPI.getSegments()
      setSegments(response.data.segments || [])
    } catch (error) {
      console.error('Failed to load segments:', error)
      setSegments([])
    }
  }

  const previewSegment = async () => {
    try {
      const response = await crmAPI.previewSegment(formData.filter_rules)
      setPreviewCount(response.data.count)
    } catch (error) {
      console.error('Failed to preview segment:', error)
      setPreviewCount(0)
    }
  }

  const handleSubmit = async (asDraft = true) => {
    try {
      setLoading(true)
      const submitData = {
        ...formData,
        status: asDraft ? 'draft' : 'active'
      }

      if (campaign) {
        await crmAPI.updateCampaign(campaign.id, submitData)
        toast.success('Campaign updated!')
      } else {
        await crmAPI.createCampaign(submitData)
        toast.success('Campaign created!')
      }
      onSave()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save campaign')
    } finally {
      setLoading(false)
    }
  }

  const updateFormData = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const updateFilterRule = (key, value) => {
    setFormData(prev => ({
      ...prev,
      filter_rules: { ...prev.filter_rules, [key]: value }
    }))
  }

  const removeFilterRule = (key) => {
    setFormData(prev => {
      const newRules = { ...prev.filter_rules }
      delete newRules[key]
      return { ...prev, filter_rules: newRules }
    })
  }

  const renderStepIndicator = () => (
    <div className="mb-8">
      <div className="flex items-center justify-center">
        {[1, 2, 3, 4, 5].map(s => (
          <React.Fragment key={s}>
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                s === step
                  ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                  : s < step
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 text-gray-600'
              }`}
            >
              {s}
            </div>
            {s < 5 && (
              <div className={`w-16 h-1 ${s < step ? 'bg-green-500' : 'bg-gray-300'}`}></div>
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="flex justify-center mt-2 text-sm font-semibold text-gray-600">
        {step === 1 && 'Campaign Type'}
        {step === 2 && 'Select Template'}
        {step === 3 && 'Build Audience'}
        {step === 4 && 'Configure Timing'}
        {step === 5 && 'Review & Save'}
      </div>
    </div>
  )

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold">{campaign ? 'Edit Campaign' : 'Create Campaign'}</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 self-end sm:self-auto">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {renderStepIndicator()}

      {/* Step 1: Campaign Type */}
      {step === 1 && (
        <div>
          <h3 className="text-lg font-bold mb-4">Select Campaign Type</h3>
          <div className="space-y-4">
            <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer hover:border-optio-purple">
              <input
                type="radio"
                name="campaign_type"
                value="manual"
                checked={formData.campaign_type === 'manual'}
                onChange={(e) => updateFormData('campaign_type', e.target.value)}
                className="mt-1"
              />
              <div className="ml-3">
                <div className="font-semibold">One-Time Campaign</div>
                <div className="text-sm text-gray-600">Send immediately or schedule for a specific date</div>
              </div>
            </label>
            <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer hover:border-optio-purple">
              <input
                type="radio"
                name="campaign_type"
                value="scheduled"
                checked={formData.campaign_type === 'scheduled'}
                onChange={(e) => updateFormData('campaign_type', e.target.value)}
                className="mt-1"
              />
              <div className="ml-3">
                <div className="font-semibold">Scheduled Campaign</div>
                <div className="text-sm text-gray-600">Schedule for a specific date and time</div>
              </div>
            </label>
            <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer hover:border-optio-purple">
              <input
                type="radio"
                name="campaign_type"
                value="triggered"
                checked={formData.campaign_type === 'triggered'}
                onChange={(e) => updateFormData('campaign_type', e.target.value)}
                className="mt-1"
              />
              <div className="ml-3">
                <div className="font-semibold">Triggered Campaign</div>
                <div className="text-sm text-gray-600">Send automatically based on user events</div>
              </div>
            </label>
          </div>
          <div className="mt-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Campaign Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => updateFormData('name', e.target.value)}
              placeholder="e.g., Welcome Email Campaign"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
            />
          </div>
        </div>
      )}

      {/* Step 2: Template Selection */}
      {step === 2 && (
        <div>
          <h3 className="text-lg font-bold mb-4">Select Email Template</h3>
          <select
            value={formData.template_key}
            onChange={(e) => updateFormData('template_key', e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
          >
            <option value="">Choose a template...</option>
            {templates.map(template => (
              <option key={template.template_key} value={template.template_key}>
                {template.name} - {template.subject}
              </option>
            ))}
          </select>
          {formData.template_key && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                Selected: <span className="font-semibold">{formData.template_key}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Audience Segment */}
      {step === 3 && (
        <div>
          <h3 className="text-lg font-bold mb-4">Build Your Audience</h3>

          {/* Saved segments */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Use Saved Segment (Optional)</label>
            <select
              value={formData.segment_id || ''}
              onChange={(e) => updateFormData('segment_id', e.target.value || null)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
            >
              <option value="">Build custom filters below...</option>
              {segments.map(segment => (
                <option key={segment.id} value={segment.id}>
                  {segment.name}
                </option>
              ))}
            </select>
          </div>

          {/* Custom filters */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Add Filters</p>
            <div className="space-y-3 mb-4">
              <div className="flex gap-2">
                <select
                  className="flex-1 px-4 py-2 border rounded-lg"
                  onChange={(e) => {
                    const field = e.target.value
                    if (field) updateFilterRule(field, '')
                  }}
                  value=""
                >
                  <option value="">Add filter...</option>
                  <option value="role">User Role</option>
                  <option value="last_active_days">Days Since Last Active</option>
                  <option value="min_quest_completions">Min Quests Completed</option>
                  <option value="max_quest_completions">Max Quests Completed</option>
                  <option value="min_xp">Min XP</option>
                  <option value="max_xp">Max XP</option>
                </select>
              </div>

              {/* Display current filters */}
              {Object.entries(formData.filter_rules).map(([key, value]) => (
                <div key={key} className="flex gap-2 items-center">
                  <span className="text-sm font-semibold text-gray-700 w-48">{key}</span>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => updateFilterRule(key, e.target.value)}
                    className="flex-1 px-4 py-2 border rounded-lg"
                    placeholder="Enter value..."
                  />
                  <button
                    onClick={() => removeFilterRule(key)}
                    className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {previewCount > 0 && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm font-semibold text-blue-900">
                  Estimated Recipients: {previewCount} users
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Timing Configuration */}
      {step === 4 && (
        <div>
          <h3 className="text-lg font-bold mb-4">Configure Timing</h3>

          {formData.campaign_type === 'scheduled' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Schedule Date & Time</label>
              <input
                type="datetime-local"
                value={formData.scheduled_for}
                onChange={(e) => updateFormData('scheduled_for', e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
              />
            </div>
          )}

          {formData.campaign_type === 'triggered' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Trigger Event</label>
                <select
                  value={formData.trigger_event}
                  onChange={(e) => updateFormData('trigger_event', e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
                >
                  <option value="">Choose event...</option>
                  <option value="registration_success">User Registration</option>
                  <option value="email_confirmed">Email Confirmed</option>
                  <option value="quest_started">Quest Started</option>
                  <option value="quest_completed">Quest Completed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Delay (hours)</label>
                <input
                  type="number"
                  value={formData.trigger_delay_hours}
                  onChange={(e) => updateFormData('trigger_delay_hours', parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
                  min="0"
                />
              </div>
            </div>
          )}

          {formData.campaign_type === 'manual' && (
            <p className="text-gray-600">This campaign will be sent immediately or you can save as draft.</p>
          )}
        </div>
      )}

      {/* Step 5: Review */}
      {step === 5 && (
        <div>
          <h3 className="text-lg font-bold mb-4">Review Campaign</h3>
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Name</p>
              <p className="font-semibold">{formData.name}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Type</p>
              <p className="font-semibold">{formData.campaign_type}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Template</p>
              <p className="font-semibold">{formData.template_key}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Estimated Recipients</p>
              <p className="font-semibold">{previewCount} users</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex justify-between mt-8">
        <button
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Previous
        </button>
        <div className="flex gap-2">
          {step === 5 && (
            <>
              <button
                onClick={() => handleSubmit(true)}
                disabled={loading}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                Save as Draft
              </button>
              <button
                onClick={() => handleSubmit(false)}
                disabled={loading}
                className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {formData.campaign_type === 'manual' ? 'Send Now' : 'Activate Campaign'}
              </button>
            </>
          )}
          {step < 5 && (
            <button
              onClick={() => setStep(Math.min(5, step + 1))}
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CampaignCreator
