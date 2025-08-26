import React, { useState } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

const StandardQuestManager = ({ quest, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    title: quest?.title || '',
    description: quest?.description || '',
    evidence_requirements: quest?.evidence_requirements || '',
    difficulty_level: quest?.difficulty_level || 'beginner',
    effort_level: quest?.effort_level || 'light',
    estimated_hours: quest?.estimated_hours || '',
    accepted_evidence_types: quest?.accepted_evidence_types || [],
    example_submissions: quest?.example_submissions || [],
    core_skills: quest?.core_skills || [],
    resources_needed: quest?.resources_needed || '',
    location_requirements: quest?.location_requirements || '',
    optional_challenges: quest?.optional_challenges || [],
    safety_considerations: quest?.safety_considerations || '',
    requires_adult_supervision: quest?.requires_adult_supervision || false,
    collaboration_ideas: quest?.collaboration_ideas || '',
    skill_xp_awards: quest?.quest_skill_xp || []
  })

  const [loadingAI, setLoadingAI] = useState(false)
  const [currentSkill, setCurrentSkill] = useState('')
  const [currentChallenge, setCurrentChallenge] = useState('')
  const [currentExample, setCurrentExample] = useState('')

  const evidenceTypes = ['photo', 'video', 'written', 'audio', 'link', 'file']
  const skillCategories = [
    { value: 'reading_writing', label: 'Reading & Writing' },
    { value: 'thinking_skills', label: 'Thinking Skills' },
    { value: 'personal_growth', label: 'Personal Growth' },
    { value: 'life_skills', label: 'Life Skills' },
    { value: 'making_creating', label: 'Making & Creating' },
    { value: 'world_understanding', label: 'World Understanding' }
  ]

  const handleAIComplete = async () => {
    setLoadingAI(true)
    try {
      const response = await api.post('/admin/quests/complete-with-ai', formData)
      setFormData(response.data)
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
    
    if (!formData.title || !formData.description || !formData.evidence_requirements) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      const endpoint = quest ? `/admin/quests/${quest.id}` : '/admin/quests'
      const method = quest ? 'put' : 'post'
      
      await api[method](endpoint, formData)
      toast.success(quest ? 'Quest updated successfully!' : 'Quest created successfully!')
      onSave()
    } catch (error) {
      toast.error(quest ? 'Failed to update quest' : 'Failed to create quest')
    }
  }

  const addSkill = () => {
    if (currentSkill.trim() && !formData.core_skills.includes(currentSkill)) {
      setFormData({ ...formData, core_skills: [...formData.core_skills, currentSkill] })
      setCurrentSkill('')
    }
  }

  const addChallenge = () => {
    if (currentChallenge.trim()) {
      setFormData({ ...formData, optional_challenges: [...formData.optional_challenges, currentChallenge] })
      setCurrentChallenge('')
    }
  }

  const addExample = () => {
    if (currentExample.trim()) {
      setFormData({ ...formData, example_submissions: [...formData.example_submissions, currentExample] })
      setCurrentExample('')
    }
  }

  const addXPAward = () => {
    const newAward = { skill_category: '', xp_amount: 50 }
    setFormData({ ...formData, skill_xp_awards: [...formData.skill_xp_awards, newAward] })
  }

  const updateXPAward = (index, field, value) => {
    const updated = [...formData.skill_xp_awards]
    updated[index][field] = field === 'xp_amount' ? parseInt(value) || 0 : value
    setFormData({ ...formData, skill_xp_awards: updated })
  }

  const removeXPAward = (index) => {
    setFormData({ 
      ...formData, 
      skill_xp_awards: formData.skill_xp_awards.filter((_, i) => i !== index)
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-xl">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">
                {quest ? 'Edit Quest' : 'Create New Quest'}
              </h2>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

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

              {/* Required Fields */}
              <div className="bg-white border rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-lg mb-4">Required Information</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quest Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., Build a Solar Oven"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                    rows="3"
                    placeholder="Describe what learners will do in this quest..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Evidence Requirements *
                  </label>
                  <textarea
                    value={formData.evidence_requirements}
                    onChange={(e) => setFormData({ ...formData, evidence_requirements: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                    rows="3"
                    placeholder="What evidence should learners submit to show their learning process?"
                    required
                  />
                </div>
              </div>

              {/* Quest Settings */}
              <div className="bg-white border rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-lg mb-4">Quest Settings</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Difficulty Level
                    </label>
                    <select
                      value={formData.difficulty_level}
                      onChange={(e) => setFormData({ ...formData, difficulty_level: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Effort Level
                    </label>
                    <select
                      value={formData.effort_level}
                      onChange={(e) => setFormData({ ...formData, effort_level: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="light">Light (1-2 hours)</option>
                      <option value="moderate">Moderate (3-5 hours)</option>
                      <option value="intensive">Intensive (6+ hours)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Estimated Hours
                    </label>
                    <input
                      type="number"
                      value={formData.estimated_hours}
                      onChange={(e) => setFormData({ ...formData, estimated_hours: parseFloat(e.target.value) || '' })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., 3"
                      min="0.5"
                      step="0.5"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Accepted Evidence Types
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {evidenceTypes.map(type => (
                      <label key={type} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.accepted_evidence_types.includes(type)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                accepted_evidence_types: [...formData.accepted_evidence_types, type]
                              })
                            } else {
                              setFormData({
                                ...formData,
                                accepted_evidence_types: formData.accepted_evidence_types.filter(t => t !== type)
                              })
                            }
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.requires_adult_supervision}
                      onChange={(e) => setFormData({ ...formData, requires_adult_supervision: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium">Requires Adult Supervision</span>
                  </label>
                </div>
              </div>

              {/* XP Awards */}
              <div className="bg-white border rounded-lg p-6">
                <h3 className="font-semibold text-lg mb-4">XP Awards</h3>
                
                <div className="space-y-2">
                  {formData.skill_xp_awards.map((award, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <select
                        value={award.skill_category}
                        onChange={(e) => updateXPAward(index, 'skill_category', e.target.value)}
                        className="flex-1 px-3 py-2 border rounded-lg"
                      >
                        <option value="">Select category...</option>
                        {skillCategories.map(cat => (
                          <option key={cat.value} value={cat.value}>{cat.label}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={award.xp_amount}
                        onChange={(e) => updateXPAward(index, 'xp_amount', e.target.value)}
                        className="w-24 px-3 py-2 border rounded-lg"
                        min="10"
                        max="100"
                        step="10"
                      />
                      <span className="text-sm text-gray-500">XP</span>
                      <button
                        type="button"
                        onClick={() => removeXPAward(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addXPAward}
                    className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                  >
                    + Add XP Award
                  </button>
                </div>
              </div>

              {/* Optional Fields */}
              <div className="bg-white border rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-lg mb-4">Additional Information</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Core Skills
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={currentSkill}
                      onChange={(e) => setCurrentSkill(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                      className="flex-1 px-3 py-2 border rounded-lg"
                      placeholder="Add a skill..."
                    />
                    <button
                      type="button"
                      onClick={addSkill}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.core_skills.map((skill, index) => (
                      <span key={index} className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                        {skill}
                        <button
                          type="button"
                          onClick={() => setFormData({
                            ...formData,
                            core_skills: formData.core_skills.filter((_, i) => i !== index)
                          })}
                          className="ml-2 text-gray-500 hover:text-red-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Resources Needed
                  </label>
                  <textarea
                    value={formData.resources_needed}
                    onChange={(e) => setFormData({ ...formData, resources_needed: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows="2"
                    placeholder="List any materials or resources required..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location Requirements
                  </label>
                  <input
                    type="text"
                    value={formData.location_requirements}
                    onChange={(e) => setFormData({ ...formData, location_requirements: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., Outdoor space, Kitchen, Computer lab"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Safety Considerations
                  </label>
                  <textarea
                    value={formData.safety_considerations}
                    onChange={(e) => setFormData({ ...formData, safety_considerations: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows="2"
                    placeholder="Any safety precautions learners should take..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Collaboration Ideas
                  </label>
                  <textarea
                    value={formData.collaboration_ideas}
                    onChange={(e) => setFormData({ ...formData, collaboration_ideas: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows="2"
                    placeholder="How can learners work together on this quest?"
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex justify-end gap-4 pt-4 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  {quest ? 'Update Quest' : 'Create Quest'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StandardQuestManager