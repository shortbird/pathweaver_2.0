import React, { useState } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

// Diploma Pillars framework
const DIPLOMA_PILLARS = {
  creativity: {
    name: 'Creativity',
    competencies: ['Artistic Expression', 'Design Thinking', 'Innovation', 'Problem-Solving']
  },
  critical_thinking: {
    name: 'Critical Thinking',
    competencies: ['Analysis & Research', 'Logic & Reasoning', 'Systems Thinking', 'Evidence-Based Decision Making']
  },
  practical_skills: {
    name: 'Practical Skills',
    competencies: ['Life Skills', 'Technical Skills', 'Financial Literacy', 'Health & Wellness']
  },
  communication: {
    name: 'Communication',
    competencies: ['Writing & Storytelling', 'Public Speaking', 'Digital Communication', 'Active Listening']
  },
  cultural_literacy: {
    name: 'Cultural Literacy',
    competencies: ['Global Awareness', 'History & Context', 'Empathy & Perspective-Taking', 'Community Engagement']
  }
}

const AdminQuestManager = ({ quest, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    title: quest?.title || '',
    big_idea: quest?.big_idea || '',
    what_youll_create: quest?.what_youll_create || [],
    primary_pillar: quest?.primary_pillar || '',
    intensity: quest?.intensity || 'light',
    estimated_time: quest?.estimated_time || '',
    your_mission: quest?.your_mission || [],
    showcase_your_journey: quest?.showcase_your_journey || '',
    helpful_resources: quest?.helpful_resources || { tools: [], materials: [], links: [] },
    collaboration_spark: quest?.collaboration_spark || '',
    real_world_bonus: quest?.real_world_bonus || null,
    log_bonus: quest?.log_bonus || { description: 'Keep a learning log', xp_amount: 25 },
    heads_up: quest?.heads_up || '',
    location: quest?.location || '',
    skill_xp_awards: quest?.quest_skill_xp || []
  })

  const [currentDeliverable, setCurrentDeliverable] = useState('')
  const [currentMissionStep, setCurrentMissionStep] = useState('')
  const [currentTool, setCurrentTool] = useState('')
  const [currentMaterial, setCurrentMaterial] = useState('')
  const [currentLink, setCurrentLink] = useState('')
  const [loadingAI, setLoadingAI] = useState(false)

  const handleAIComplete = async () => {
    setLoadingAI(true)
    try {
      const response = await api.post('/admin/quests/complete-with-ai', formData)
      setFormData({
        ...response.data,
        skill_xp_awards: response.data.skill_xp_awards || []
      })
      toast.success('Quest completed with AI!')
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to complete with AI'
      toast.error(errorMsg)
    } finally {
      setLoadingAI(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.primary_pillar) {
      toast.error('Please select a primary pillar')
      return
    }

    if (formData.your_mission.length === 0) {
      toast.error('Please add at least one mission step')
      return
    }

    // Ensure skill XP awards include the primary pillar
    const hasMainPillarXP = formData.skill_xp_awards.some(
      award => award.skill_category === formData.primary_pillar
    )
    
    let finalSkillXPAwards = [...formData.skill_xp_awards]
    if (!hasMainPillarXP) {
      // Auto-add XP for primary pillar based on intensity
      const xpAmount = formData.intensity === 'light' ? 50 : 
                      formData.intensity === 'moderate' ? 100 : 200
      finalSkillXPAwards.push({
        skill_category: formData.primary_pillar,
        xp_amount: xpAmount
      })
    }

    try {
      const endpoint = quest ? `/admin/quests/${quest.id}` : '/admin/quests'
      const method = quest ? 'put' : 'post'
      
      await api[method](endpoint, {
        ...formData,
        skill_xp_awards: finalSkillXPAwards
      })
      toast.success(quest ? 'Quest updated successfully!' : 'Quest created successfully!')
      onSave()
    } catch (error) {
      toast.error(quest ? 'Failed to update quest' : 'Failed to create quest')
    }
  }

  const addDeliverable = () => {
    if (currentDeliverable.trim()) {
      setFormData({
        ...formData,
        what_youll_create: [...formData.what_youll_create, currentDeliverable.trim()]
      })
      setCurrentDeliverable('')
    }
  }

  const removeDeliverable = (index) => {
    setFormData({
      ...formData,
      what_youll_create: formData.what_youll_create.filter((_, i) => i !== index)
    })
  }

  const addMissionStep = () => {
    if (currentMissionStep.trim()) {
      setFormData({
        ...formData,
        your_mission: [...formData.your_mission, currentMissionStep.trim()]
      })
      setCurrentMissionStep('')
    }
  }

  const removeMissionStep = (index) => {
    setFormData({
      ...formData,
      your_mission: formData.your_mission.filter((_, i) => i !== index)
    })
  }

  const addResource = (type, value, setter) => {
    if (value.trim()) {
      setFormData({
        ...formData,
        helpful_resources: {
          ...formData.helpful_resources,
          [type]: [...(formData.helpful_resources[type] || []), value.trim()]
        }
      })
      setter('')
    }
  }

  const removeResource = (type, index) => {
    setFormData({
      ...formData,
      helpful_resources: {
        ...formData.helpful_resources,
        [type]: formData.helpful_resources[type].filter((_, i) => i !== index)
      }
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6">
          {quest ? 'Edit Quest' : 'Create New Quest'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* AI Complete Button */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border border-purple-200">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-gray-900">Need help completing this quest?</h3>
                <p className="text-sm text-gray-600 mt-1">
                  AI will intelligently fill in missing fields based on what you've already entered
                </p>
              </div>
              <button
                type="button"
                onClick={handleAIComplete}
                disabled={loadingAI}
                className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                  loadingAI 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white'
                }`}
              >
                {loadingAI ? 'Processing...' : '✨ Finish with AI'}
              </button>
            </div>
          </div>

          {/* The Big Picture */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">The Big Picture</h3>
            
            <div>
              <label className="block text-sm font-medium mb-1">Quest Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="input-field w-full"
                placeholder="An engaging, narrative title"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Big Idea *</label>
              <textarea
                value={formData.big_idea}
                onChange={(e) => setFormData({ ...formData, big_idea: e.target.value })}
                className="input-field w-full h-24"
                placeholder="The overarching concept or challenge that frames this quest..."
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Primary Pillar *</label>
                <select
                  value={formData.primary_pillar}
                  onChange={(e) => setFormData({ ...formData, primary_pillar: e.target.value })}
                  className="input-field w-full"
                  required
                >
                  <option value="">Select Pillar</option>
                  {Object.entries(DIPLOMA_PILLARS).map(([key, pillar]) => (
                    <option key={key} value={key}>{pillar.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Intensity *</label>
                <select
                  value={formData.intensity}
                  onChange={(e) => setFormData({ ...formData, intensity: e.target.value })}
                  className="input-field w-full"
                  required
                >
                  <option value="light">Light (1-3 hours)</option>
                  <option value="moderate">Moderate (4-10 hours)</option>
                  <option value="intensive">Intensive (10+ hours)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Estimated Time</label>
              <input
                type="text"
                value={formData.estimated_time}
                onChange={(e) => setFormData({ ...formData, estimated_time: e.target.value })}
                className="input-field w-full"
                placeholder="e.g., '2-3 hours', '1 week', 'ongoing'"
              />
            </div>
          </div>

          {/* What You'll Create */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">What You'll Create</h3>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={currentDeliverable}
                onChange={(e) => setCurrentDeliverable(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addDeliverable())}
                className="input-field flex-1"
                placeholder="Add a deliverable or outcome..."
              />
              <button
                type="button"
                onClick={addDeliverable}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Add
              </button>
            </div>
            
            {formData.what_youll_create.length > 0 && (
              <div className="bg-gray-50 rounded p-3">
                {formData.what_youll_create.map((item, index) => (
                  <div key={index} className="flex justify-between items-center mb-2">
                    <span className="text-sm">• {item}</span>
                    <button
                      type="button"
                      onClick={() => removeDeliverable(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Your Mission */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Your Mission *</h3>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={currentMissionStep}
                onChange={(e) => setCurrentMissionStep(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addMissionStep())}
                className="input-field flex-1"
                placeholder="Add a mission step..."
              />
              <button
                type="button"
                onClick={addMissionStep}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Add Step
              </button>
            </div>
            
            {formData.your_mission.length > 0 && (
              <div className="bg-gray-50 rounded p-3">
                {formData.your_mission.map((step, index) => (
                  <div key={index} className="flex justify-between items-center mb-2">
                    <span className="text-sm">{index + 1}. {step}</span>
                    <button
                      type="button"
                      onClick={() => removeMissionStep(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Showcase Your Journey */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Showcase Your Journey</h3>
            
            <div>
              <label className="block text-sm font-medium mb-1">How to Document & Share *</label>
              <textarea
                value={formData.showcase_your_journey}
                onChange={(e) => setFormData({ ...formData, showcase_your_journey: e.target.value })}
                className="input-field w-full h-24"
                placeholder="Describe how students should document and share their work..."
                required
              />
            </div>
          </div>

          {/* Your Toolkit */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Your Toolkit</h3>
            
            {/* Tools */}
            <div>
              <label className="block text-sm font-medium mb-1">Tools</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentTool}
                  onChange={(e) => setCurrentTool(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addResource('tools', currentTool, setCurrentTool))}
                  className="input-field flex-1"
                  placeholder="Add a tool..."
                />
                <button
                  type="button"
                  onClick={() => addResource('tools', currentTool, setCurrentTool)}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
              {formData.helpful_resources.tools?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {formData.helpful_resources.tools.map((tool, index) => (
                    <span key={index} className="bg-blue-100 px-3 py-1 rounded-full text-sm">
                      {tool}
                      <button
                        type="button"
                        onClick={() => removeResource('tools', index)}
                        className="ml-2 text-red-600 hover:text-red-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Materials */}
            <div>
              <label className="block text-sm font-medium mb-1">Materials</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentMaterial}
                  onChange={(e) => setCurrentMaterial(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addResource('materials', currentMaterial, setCurrentMaterial))}
                  className="input-field flex-1"
                  placeholder="Add a material..."
                />
                <button
                  type="button"
                  onClick={() => addResource('materials', currentMaterial, setCurrentMaterial)}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
              {formData.helpful_resources.materials?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {formData.helpful_resources.materials.map((material, index) => (
                    <span key={index} className="bg-green-100 px-3 py-1 rounded-full text-sm">
                      {material}
                      <button
                        type="button"
                        onClick={() => removeResource('materials', index)}
                        className="ml-2 text-red-600 hover:text-red-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Links */}
            <div>
              <label className="block text-sm font-medium mb-1">Helpful Links</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentLink}
                  onChange={(e) => setCurrentLink(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addResource('links', currentLink, setCurrentLink))}
                  className="input-field flex-1"
                  placeholder="Add a helpful link or resource..."
                />
                <button
                  type="button"
                  onClick={() => addResource('links', currentLink, setCurrentLink)}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
              {formData.helpful_resources.links?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {formData.helpful_resources.links.map((link, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm text-blue-600">{link}</span>
                      <button
                        type="button"
                        onClick={() => removeResource('links', index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Go Further */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Go Further</h3>
            
            <div>
              <label className="block text-sm font-medium mb-1">Collaboration Spark</label>
              <textarea
                value={formData.collaboration_spark}
                onChange={(e) => setFormData({ ...formData, collaboration_spark: e.target.value })}
                className="input-field w-full h-20"
                placeholder="Ideas for working with others..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Real World Bonus</label>
                <input
                  type="text"
                  value={formData.real_world_bonus?.description || ''}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    real_world_bonus: e.target.value ? {
                      description: e.target.value,
                      xp_amount: formData.real_world_bonus?.xp_amount || 50
                    } : null
                  })}
                  className="input-field w-full"
                  placeholder="Extension challenge..."
                />
                {formData.real_world_bonus && (
                  <input
                    type="number"
                    value={formData.real_world_bonus.xp_amount}
                    onChange={(e) => setFormData({
                      ...formData,
                      real_world_bonus: {
                        ...formData.real_world_bonus,
                        xp_amount: parseInt(e.target.value) || 50
                      }
                    })}
                    className="input-field w-full mt-2"
                    placeholder="XP amount"
                    min="10"
                    max="100"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Learning Log Bonus</label>
                <input
                  type="text"
                  value={formData.log_bonus?.description || ''}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    log_bonus: {
                      description: e.target.value || 'Keep a learning log',
                      xp_amount: formData.log_bonus?.xp_amount || 25
                    }
                  })}
                  className="input-field w-full"
                  placeholder="Log bonus description..."
                />
                <input
                  type="number"
                  value={formData.log_bonus?.xp_amount || 25}
                  onChange={(e) => setFormData({
                    ...formData,
                    log_bonus: {
                      ...formData.log_bonus,
                      description: formData.log_bonus?.description || 'Keep a learning log',
                      xp_amount: parseInt(e.target.value) || 25
                    }
                  })}
                  className="input-field w-full mt-2"
                  placeholder="XP amount"
                  min="10"
                  max="50"
                />
              </div>
            </div>
          </div>

          {/* The Fine Print */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">The Fine Print</h3>
            
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="input-field w-full"
                placeholder="Where this can be done..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Heads Up</label>
              <textarea
                value={formData.heads_up}
                onChange={(e) => setFormData({ ...formData, heads_up: e.target.value })}
                className="input-field w-full h-20"
                placeholder="Safety considerations or important notes..."
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-primary text-white rounded hover:bg-primary-dark"
            >
              {quest ? 'Update Quest' : 'Create Quest'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AdminQuestManager