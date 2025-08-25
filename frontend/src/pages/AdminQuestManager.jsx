import React, { useState } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

// Core skills framework
const SKILL_CATEGORIES = {
  reading_writing: {
    name: 'Reading & Writing',
    skills: ['reading', 'writing', 'speaking', 'digital_media', 'math_data']
  },
  thinking_skills: {
    name: 'Thinking Skills',
    skills: ['critical_thinking', 'creative_thinking', 'research', 'information_literacy', 'systems_thinking', 'decision_making']
  },
  personal_growth: {
    name: 'Personal Growth',
    skills: ['learning_reflection', 'emotional_skills', 'grit', 'time_management']
  },
  life_skills: {
    name: 'Life Skills',
    skills: ['money_skills', 'health_fitness', 'home_skills', 'tech_skills', 'citizenship']
  },
  making_creating: {
    name: 'Making & Creating',
    skills: ['building', 'art', 'scientific_method', 'coding', 'business_thinking']
  },
  world_understanding: {
    name: 'World Understanding',
    skills: ['cultural_awareness', 'history', 'environment', 'teamwork', 'ethics_philosophy']
  }
}

const EVIDENCE_TYPES = [
  { value: 'photo', label: 'Photo' },
  { value: 'video', label: 'Video' },
  { value: 'written', label: 'Written Work' },
  { value: 'project_link', label: 'Project Link' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'artifact', label: 'Physical Artifact' },
  { value: 'certificate', label: 'Certificate' }
]

const AdminQuestManager = ({ quest, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    title: quest?.title || '',
    description: quest?.description || '',
    difficulty_level: quest?.difficulty_level || 'beginner',
    estimated_hours: quest?.estimated_hours || '',
    effort_level: quest?.effort_level || 'light',
    evidence_requirements: quest?.evidence_requirements || '',
    accepted_evidence_types: quest?.accepted_evidence_types || [],
    example_submissions: quest?.example_submissions || '',
    core_skills: quest?.core_skills || [],
    resources_needed: quest?.resources_needed || '',
    location_requirements: quest?.location_requirements || '',
    skill_xp_awards: quest?.quest_skill_xp || [],
    optional_challenges: quest?.optional_challenges || [],
    safety_considerations: quest?.safety_considerations || '',
    requires_adult_supervision: quest?.requires_adult_supervision || false
  })

  const [currentSkillAward, setCurrentSkillAward] = useState({
    skill_category: '',
    xp_amount: ''
  })

  const [currentChallenge, setCurrentChallenge] = useState({
    description: '',
    core_skills: [],
    skill_category: '',
    xp_amount: ''
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (formData.skill_xp_awards.length === 0) {
      toast.error('Please add at least one skill category with XP')
      return
    }

    if (formData.core_skills.length === 0) {
      toast.error('Please select at least one core skill')
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

  const addSkillAward = () => {
    if (currentSkillAward.skill_category && currentSkillAward.xp_amount) {
      // Check if category already exists
      const exists = formData.skill_xp_awards.find(
        award => award.skill_category === currentSkillAward.skill_category
      )
      if (exists) {
        toast.error('This skill category already has XP assigned')
        return
      }
      
      setFormData({
        ...formData,
        skill_xp_awards: [...formData.skill_xp_awards, {
          skill_category: currentSkillAward.skill_category,
          xp_amount: parseInt(currentSkillAward.xp_amount)
        }]
      })
      setCurrentSkillAward({ skill_category: '', xp_amount: '' })
    }
  }

  const removeSkillAward = (index) => {
    setFormData({
      ...formData,
      skill_xp_awards: formData.skill_xp_awards.filter((_, i) => i !== index)
    })
  }

  const addOptionalChallenge = () => {
    if (currentChallenge.description && currentChallenge.skill_category && currentChallenge.xp_amount) {
      setFormData({
        ...formData,
        optional_challenges: [...formData.optional_challenges, {
          description: currentChallenge.description,
          core_skills: currentChallenge.core_skills,
          skill_category: currentChallenge.skill_category,
          xp_amount: parseInt(currentChallenge.xp_amount)
        }]
      })
      setCurrentChallenge({
        description: '',
        core_skills: [],
        skill_category: '',
        xp_amount: ''
      })
    }
  }

  const removeOptionalChallenge = (index) => {
    setFormData({
      ...formData,
      optional_challenges: formData.optional_challenges.filter((_, i) => i !== index)
    })
  }

  const toggleCoreSkill = (skill) => {
    if (formData.core_skills.includes(skill)) {
      setFormData({
        ...formData,
        core_skills: formData.core_skills.filter(s => s !== skill)
      })
    } else {
      setFormData({
        ...formData,
        core_skills: [...formData.core_skills, skill]
      })
    }
  }

  const toggleEvidenceType = (type) => {
    if (formData.accepted_evidence_types.includes(type)) {
      setFormData({
        ...formData,
        accepted_evidence_types: formData.accepted_evidence_types.filter(t => t !== type)
      })
    } else {
      setFormData({
        ...formData,
        accepted_evidence_types: [...formData.accepted_evidence_types, type]
      })
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6">
          {quest ? 'Edit Quest' : 'Create New Quest'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Basic Information</h3>
            
            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="input-field w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description *</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="input-field w-full h-32"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Difficulty Level *</label>
                <select
                  value={formData.difficulty_level}
                  onChange={(e) => setFormData({ ...formData, difficulty_level: e.target.value })}
                  className="input-field w-full"
                  required
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Effort Level *</label>
                <select
                  value={formData.effort_level}
                  onChange={(e) => setFormData({ ...formData, effort_level: e.target.value })}
                  className="input-field w-full"
                  required
                >
                  <option value="light">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="intensive">Intensive</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Estimated Hours</label>
                <input
                  type="number"
                  value={formData.estimated_hours}
                  onChange={(e) => setFormData({ ...formData, estimated_hours: e.target.value })}
                  className="input-field w-full"
                  min="1"
                  max="200"
                />
              </div>
            </div>
          </div>

          {/* Evidence Suggestions */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Evidence Suggestions</h3>
            
            <div>
              <label className="block text-sm font-medium mb-1">Evidence Suggestions *</label>
              <textarea
                value={formData.evidence_requirements}
                onChange={(e) => setFormData({ ...formData, evidence_requirements: e.target.value })}
                className="input-field w-full h-24"
                placeholder="Suggest ways students can demonstrate their learning (remember: they already have their diploma)..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Accepted Evidence Types *</label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {EVIDENCE_TYPES.map(type => (
                  <label key={type.value} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.accepted_evidence_types.includes(type.value)}
                      onChange={() => toggleEvidenceType(type.value)}
                      className="mr-2"
                    />
                    <span className="text-sm">{type.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Example Submissions</label>
              <textarea
                value={formData.example_submissions}
                onChange={(e) => setFormData({ ...formData, example_submissions: e.target.value })}
                className="input-field w-full h-20"
                placeholder="Provide examples of good submissions..."
              />
            </div>
          </div>

          {/* Core Skills */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Core Skills *</h3>
            
            {Object.entries(SKILL_CATEGORIES).map(([categoryKey, category]) => (
              <div key={categoryKey} className="border-l-4 border-gray-200 pl-4">
                <h4 className="font-medium text-sm mb-2">{category.name}</h4>
                <div className="grid grid-cols-2 gap-2">
                  {category.skills.map(skill => (
                    <label key={skill} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.core_skills.includes(skill)}
                        onChange={() => toggleCoreSkill(skill)}
                        className="mr-2"
                      />
                      <span className="text-sm">{skill.replace(/_/g, ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Skill XP Awards */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Skill Category XP Awards *</h3>
            
            <div className="flex gap-2">
              <select
                value={currentSkillAward.skill_category}
                onChange={(e) => setCurrentSkillAward({ ...currentSkillAward, skill_category: e.target.value })}
                className="input-field flex-1"
              >
                <option value="">Select Skill Category</option>
                {Object.entries(SKILL_CATEGORIES).map(([key, category]) => (
                  <option key={key} value={key}>{category.name}</option>
                ))}
              </select>
              <input
                type="number"
                placeholder="XP Amount"
                value={currentSkillAward.xp_amount}
                onChange={(e) => setCurrentSkillAward({ ...currentSkillAward, xp_amount: e.target.value })}
                className="input-field w-32"
                min="1"
              />
              <button
                type="button"
                onClick={addSkillAward}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Add
              </button>
            </div>
            
            {formData.skill_xp_awards.length > 0 && (
              <div className="bg-gray-50 rounded p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">Current Awards:</p>
                {formData.skill_xp_awards.map((award, index) => (
                  <div key={index} className="flex justify-between items-center mb-1">
                    <span className="text-sm">
                      {SKILL_CATEGORIES[award.skill_category]?.name}: 
                      <span className="font-semibold ml-2">{award.xp_amount} XP</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSkillAward(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional Challenges */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Optional Challenges</h3>
            
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Challenge description"
                value={currentChallenge.description}
                onChange={(e) => setCurrentChallenge({ ...currentChallenge, description: e.target.value })}
                className="input-field w-full"
              />
              <div className="flex gap-2">
                <select
                  value={currentChallenge.skill_category}
                  onChange={(e) => setCurrentChallenge({ ...currentChallenge, skill_category: e.target.value })}
                  className="input-field flex-1"
                >
                  <option value="">Select Skill Category</option>
                  {Object.entries(SKILL_CATEGORIES).map(([key, category]) => (
                    <option key={key} value={key}>{category.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Bonus XP"
                  value={currentChallenge.xp_amount}
                  onChange={(e) => setCurrentChallenge({ ...currentChallenge, xp_amount: e.target.value })}
                  className="input-field w-32"
                  min="1"
                />
                <button
                  type="button"
                  onClick={addOptionalChallenge}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  Add Challenge
                </button>
              </div>
            </div>
            
            {formData.optional_challenges.length > 0 && (
              <div className="bg-gray-50 rounded p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">Current Challenges:</p>
                {formData.optional_challenges.map((challenge, index) => (
                  <div key={index} className="mb-2 pb-2 border-b last:border-0">
                    <div className="flex justify-between">
                      <span className="text-sm">{challenge.description}</span>
                      <button
                        type="button"
                        onClick={() => removeOptionalChallenge(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                    <span className="text-xs text-gray-600">
                      {SKILL_CATEGORIES[challenge.skill_category]?.name}: +{challenge.xp_amount} XP
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Additional Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Additional Information</h3>
            
            <div>
              <label className="block text-sm font-medium mb-1">Resources Needed</label>
              <textarea
                value={formData.resources_needed}
                onChange={(e) => setFormData({ ...formData, resources_needed: e.target.value })}
                className="input-field w-full h-20"
                placeholder="List any materials or resources needed..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Suggested Locations</label>
              <input
                type="text"
                value={formData.location_requirements}
                onChange={(e) => setFormData({ ...formData, location_requirements: e.target.value })}
                className="input-field w-full"
                placeholder="e.g., Outdoors, Kitchen, Computer lab..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Safety Considerations</label>
              <textarea
                value={formData.safety_considerations}
                onChange={(e) => setFormData({ ...formData, safety_considerations: e.target.value })}
                className="input-field w-full h-20"
                placeholder="Any safety warnings or precautions..."
              />
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