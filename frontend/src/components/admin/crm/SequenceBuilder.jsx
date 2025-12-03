import React, { useState, useEffect } from 'react'
import { crmAPI } from '../../../services/crmAPI'
import toast from 'react-hot-toast'

const SequenceBuilder = ({ onUpdate }) => {
  const [sequences, setSequences] = useState([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingSequence, setEditingSequence] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    trigger_event: '',
    is_active: false,
    steps: []
  })
  const [templates, setTemplates] = useState([])

  useEffect(() => {
    fetchSequences()
    fetchTemplates()
  }, [])

  const fetchSequences = async () => {
    try {
      setLoading(true)
      const response = await crmAPI.getSequences()
      setSequences(response.data.sequences || [])
    } catch (error) {
      toast.error('Failed to load sequences')
      console.error(error)
      setSequences([])
    } finally {
      setLoading(false)
    }
  }

  const fetchTemplates = async () => {
    try {
      const response = await crmAPI.getTemplates(true)
      setTemplates(response.data.templates || [])
    } catch (error) {
      console.error('Failed to load templates:', error)
      setTemplates([])
    }
  }

  const handleActivateSequence = async (sequence) => {
    const confirmed = window.confirm(
      `Activate sequence "${sequence.name}"? This will start sending automated emails.`
    )
    if (!confirmed) return

    try {
      await crmAPI.activateSequence(sequence.id)
      toast.success('Sequence activated!')
      fetchSequences()
      if (onUpdate) onUpdate()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to activate sequence')
    }
  }

  const handlePauseSequence = async (sequence) => {
    const confirmed = window.confirm(
      `Pause sequence "${sequence.name}"? No new emails will be sent.`
    )
    if (!confirmed) return

    try {
      await crmAPI.pauseSequence(sequence.id)
      toast.success('Sequence paused')
      fetchSequences()
      if (onUpdate) onUpdate()
    } catch (error) {
      toast.error('Failed to pause sequence')
    }
  }

  const handleDeleteSequence = async (sequence) => {
    const confirmed = window.confirm(
      `Delete sequence "${sequence.name}"? This cannot be undone.`
    )
    if (!confirmed) return

    try {
      await crmAPI.deleteSequence(sequence.id)
      toast.success('Sequence deleted')
      fetchSequences()
      if (onUpdate) onUpdate()
    } catch (error) {
      toast.error('Failed to delete sequence')
    }
  }

  const handleSaveSequence = async () => {
    if (!formData.name || !formData.trigger_event || formData.steps.length === 0) {
      toast.error('Please fill in all required fields and add at least one step')
      return
    }

    try {
      if (editingSequence) {
        await crmAPI.updateSequence(editingSequence.id, formData)
        toast.success('Sequence updated!')
      } else {
        await crmAPI.createSequence(formData)
        toast.success('Sequence created!')
      }
      setShowBuilder(false)
      setEditingSequence(null)
      setFormData({ name: '', description: '', trigger_event: '', is_active: false, steps: [] })
      fetchSequences()
      if (onUpdate) onUpdate()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save sequence')
    }
  }

  const handleEditSequence = (sequence) => {
    setEditingSequence(sequence)
    setFormData({
      name: sequence.name,
      description: sequence.description || '',
      trigger_event: sequence.trigger_event,
      is_active: sequence.is_active,
      steps: sequence.steps || []
    })
    setShowBuilder(true)
  }

  const addStep = () => {
    setFormData(prev => ({
      ...prev,
      steps: [
        ...prev.steps,
        {
          delay_hours: 0,
          template_key: '',
          condition: null
        }
      ]
    }))
  }

  const updateStep = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      steps: prev.steps.map((step, i) =>
        i === index ? { ...step, [field]: value } : step
      )
    }))
  }

  const removeStep = (index) => {
    setFormData(prev => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index)
    }))
  }

  if (showBuilder) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {editingSequence ? 'Edit Sequence' : 'Create Sequence'}
          </h2>
          <button
            onClick={() => {
              setShowBuilder(false)
              setEditingSequence(null)
              setFormData({ name: '', description: '', trigger_event: '', is_active: false, steps: [] })
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Sequence Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., New User Onboarding"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe this sequence..."
              rows={2}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Trigger Event</label>
            <select
              value={formData.trigger_event}
              onChange={(e) => setFormData(prev => ({ ...prev, trigger_event: e.target.value }))}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
            >
              <option value="">Choose trigger event...</option>
              <option value="registration_success">User Registration</option>
              <option value="email_confirmed">Email Confirmed</option>
              <option value="quest_started">Quest Started</option>
              <option value="quest_completed">Quest Completed</option>
            </select>
          </div>

          {/* Steps */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-semibold text-gray-700">Email Steps</label>
              <button
                onClick={addStep}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700"
              >
                + Add Step
              </button>
            </div>

            {formData.steps.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No steps added yet. Click "Add Step" to begin.</p>
            ) : (
              <div className="space-y-4">
                {formData.steps.map((step, index) => (
                  <div key={index} className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-optio-purple text-white rounded-full text-sm font-bold">
                          {index + 1}
                        </span>
                        <span className="text-sm font-semibold text-gray-700">
                          {step.delay_hours === 0
                            ? 'Immediately'
                            : step.delay_hours < 24
                            ? `${step.delay_hours} hours later`
                            : `Day ${Math.floor(step.delay_hours / 24)}`}
                        </span>
                      </div>
                      <button
                        onClick={() => removeStep(index)}
                        className="text-red-600 hover:text-red-900 text-sm font-semibold"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Delay (hours)</label>
                        <input
                          type="number"
                          value={step.delay_hours}
                          onChange={(e) => updateStep(index, 'delay_hours', parseInt(e.target.value) || 0)}
                          min="0"
                          className="w-full px-3 py-2 border rounded"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Template</label>
                        <select
                          value={step.template_key}
                          onChange={(e) => updateStep(index, 'template_key', e.target.value)}
                          className="w-full px-3 py-2 border rounded"
                        >
                          <option value="">Choose template...</option>
                          {templates.map(t => (
                            <option key={t.template_key} value={t.template_key}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Visual timeline */}
          {formData.steps.length > 0 && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm font-semibold text-blue-900 mb-3">Timeline Preview</p>
              <div className="space-y-2">
                {formData.steps.map((step, index) => {
                  const template = templates.find(t => t.template_key === step.template_key)
                  return (
                    <div key={index} className="flex items-center gap-3">
                      <div className="w-16 text-sm font-bold text-blue-900">
                        {step.delay_hours === 0 ? 'Day 0' : `Day ${Math.ceil(step.delay_hours / 24)}`}
                      </div>
                      <div className="flex-1 px-3 py-2 bg-white rounded border border-blue-200">
                        <p className="text-sm font-semibold">{template?.name || 'No template selected'}</p>
                        <p className="text-xs text-gray-600">{template?.subject || ''}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => {
                setShowBuilder(false)
                setEditingSequence(null)
                setFormData({ name: '', description: '', trigger_event: '', is_active: false, steps: [] })
              }}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSequence}
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90"
            >
              Save Sequence
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Automation Sequences</h2>
          <p className="text-sm text-gray-600 mt-1">Set up automated email sequences triggered by user events</p>
        </div>
        <button
          onClick={() => setShowBuilder(true)}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90"
        >
          Create Sequence
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        </div>
      ) : sequences.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No sequences created yet. Create your first automation sequence!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sequences.map(sequence => (
            <div
              key={sequence.id}
              className={`bg-white border-2 rounded-lg p-6 ${
                sequence.is_active ? 'border-green-500' : 'border-gray-200'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold">{sequence.name}</h3>
                    {sequence.is_active ? (
                      <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full">
                        ACTIVE
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full">
                        INACTIVE
                      </span>
                    )}
                  </div>
                  {sequence.description && (
                    <p className="text-sm text-gray-600 mb-2">{sequence.description}</p>
                  )}
                  <p className="text-sm text-gray-500">
                    <span className="font-semibold">Trigger:</span> {sequence.trigger_event}
                  </p>
                  <p className="text-sm text-gray-500">
                    <span className="font-semibold">Steps:</span> {sequence.steps?.length || 0} emails
                  </p>
                </div>
              </div>

              {/* Timeline */}
              {sequence.steps && sequence.steps.length > 0 && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Email Timeline:</p>
                  <div className="space-y-1">
                    {sequence.steps.map((step, index) => (
                      <div key={index} className="text-sm text-gray-700">
                        <span className="font-semibold">
                          {step.delay_hours === 0 ? 'Immediately' : `Day ${Math.ceil(step.delay_hours / 24)}`}:
                        </span>{' '}
                        {step.template_key}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => handleEditSequence(sequence)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-semibold"
                >
                  Edit
                </button>
                {sequence.is_active ? (
                  <button
                    onClick={() => handlePauseSequence(sequence)}
                    className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-sm font-semibold"
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={() => handleActivateSequence(sequence)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-bold"
                  >
                    ACTIVATE SEQUENCE
                  </button>
                )}
                <button
                  onClick={() => handleDeleteSequence(sequence)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SequenceBuilder
