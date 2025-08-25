import React, { useState, useEffect } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

const AIQuestGenerator = ({ onQuestAccepted, onClose }) => {
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatedQuests, setGeneratedQuests] = useState([])
  const [currentQuestIndex, setCurrentQuestIndex] = useState(0)
  const [existingTitles, setExistingTitles] = useState([])
  const [theme, setTheme] = useState('')
  const [source, setSource] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editingQuest, setEditingQuest] = useState(null)

  useEffect(() => {
    fetchExistingTitles()
  }, [])

  const fetchExistingTitles = async () => {
    try {
      const response = await api.get('/ai-quests/existing-titles')
      setExistingTitles(response.data.titles)
    } catch (error) {
      console.error('Failed to fetch existing titles:', error)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const response = await api.post('/ai-quests/generate', {
        theme: theme,
        existing_titles: existingTitles
      })
      
      setGeneratedQuests(response.data.quests)
      setSource(response.data.source)
      setCurrentQuestIndex(0)
      
      if (response.data.source === 'sample') {
        toast('Using sample quests (Gemini API may be unavailable)', {
          icon: 'ℹ️',
          duration: 5000
        })
      } else if (response.data.source === 'ai') {
        toast.success('AI quests generated successfully!')
      }
    } catch (error) {
      toast.error('Failed to generate quests')
      console.error(error)
    } finally {
      setGenerating(false)
    }
  }

  const handleAccept = async () => {
    const quest = generatedQuests[currentQuestIndex]
    setLoading(true)
    
    try {
      await api.post('/admin/quests', quest)
      toast.success('Quest created successfully!')
      
      // Add to existing titles to avoid duplicates
      setExistingTitles([...existingTitles, quest.title])
      
      // Call parent callback
      onQuestAccepted()
      
      // Reset editing state
      setIsEditing(false)
      setEditingQuest(null)
      
      // Move to next quest or close if done
      if (currentQuestIndex < generatedQuests.length - 1) {
        setCurrentQuestIndex(currentQuestIndex + 1)
      } else {
        toast.success('All quests reviewed!')
        onClose()
      }
    } catch (error) {
      toast.error('Failed to create quest')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleReject = () => {
    setIsEditing(false)
    setEditingQuest(null)
    if (currentQuestIndex < generatedQuests.length - 1) {
      setCurrentQuestIndex(currentQuestIndex + 1)
    } else {
      toast.success('All quests reviewed!')
      onClose()
    }
  }

  const handleSkipAll = () => {
    setGeneratedQuests([])
    setCurrentQuestIndex(0)
    setIsEditing(false)
    setEditingQuest(null)
  }

  const handleEdit = () => {
    const quest = generatedQuests[currentQuestIndex]
    setEditingQuest({ ...quest })
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    // Update the current quest with the edited version
    const updatedQuests = [...generatedQuests]
    updatedQuests[currentQuestIndex] = editingQuest
    setGeneratedQuests(updatedQuests)
    setIsEditing(false)
    setEditingQuest(null)
    toast.success('Quest updated successfully!')
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditingQuest(null)
  }

  const handleEditFieldChange = (field, value) => {
    setEditingQuest(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSkillXpChange = (index, field, value) => {
    const updatedAwards = [...editingQuest.skill_xp_awards]
    updatedAwards[index] = { ...updatedAwards[index], [field]: value }
    setEditingQuest(prev => ({
      ...prev,
      skill_xp_awards: updatedAwards
    }))
  }

  const addSkillXpAward = () => {
    const newAward = { skill_category: 'reading_writing', xp_amount: 50 }
    setEditingQuest(prev => ({
      ...prev,
      skill_xp_awards: [...prev.skill_xp_awards, newAward]
    }))
  }

  const removeSkillXpAward = (index) => {
    const updatedAwards = editingQuest.skill_xp_awards.filter((_, i) => i !== index)
    setEditingQuest(prev => ({
      ...prev,
      skill_xp_awards: updatedAwards
    }))
  }

  const currentQuest = generatedQuests[currentQuestIndex]

  const skillCategoryNames = {
    reading_writing: 'Reading & Writing',
    thinking_skills: 'Thinking Skills',
    personal_growth: 'Personal Growth',
    life_skills: 'Life Skills',
    making_creating: 'Making & Creating',
    world_understanding: 'World Understanding'
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">AI Quest Generator</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6">
          {!generatedQuests.length ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Theme or Topic (Optional)
                </label>
                <input
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="e.g., Environmental awareness, Digital skills, Creative arts..."
                  className="input-field w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank for diverse quest suggestions
                </p>
              </div>

              {existingTitles.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">
                    Existing Quests ({existingTitles.length})
                  </p>
                  <div className="bg-gray-50 rounded p-3 max-h-32 overflow-y-auto">
                    <div className="flex flex-wrap gap-1">
                      {existingTitles.map((title, idx) => (
                        <span key={idx} className="text-xs bg-white px-2 py-1 rounded border">
                          {title}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    AI will generate unique quests different from these
                  </p>
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="btn-primary w-full"
              >
                {generating ? (
                  <span className="flex items-center justify-center">
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                    Generating 5 Unique Quests...
                  </span>
                ) : (
                  '🤖 Generate 5 Quest Ideas'
                )}
              </button>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>How it works:</strong> The AI will generate 5 unique quest ideas based on your theme 
                  and avoiding existing quest titles. You'll review each one and can accept or reject them individually.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    Reviewing Quest {currentQuestIndex + 1} of {generatedQuests.length}
                  </span>
                  {source === 'sample' && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                      Sample Quest
                    </span>
                  )}
                  {source === 'ai' && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      AI Generated
                    </span>
                  )}
                </div>
                <button
                  onClick={handleSkipAll}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Skip All Remaining
                </button>
              </div>

              {currentQuest && (
                <div className="border rounded-lg p-6 space-y-4 bg-gradient-to-br from-blue-50 to-purple-50">
                  {isEditing ? (
                    // Edit Form
                    <div className="space-y-4">
                      <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Quest</h3>
                      
                      <div>
                        <label className="block text-sm font-medium mb-2">Title</label>
                        <input
                          type="text"
                          value={editingQuest.title}
                          onChange={(e) => handleEditFieldChange('title', e.target.value)}
                          className="input-field w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Description</label>
                        <textarea
                          value={editingQuest.description}
                          onChange={(e) => handleEditFieldChange('description', e.target.value)}
                          className="input-field w-full h-20"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Difficulty</label>
                          <select
                            value={editingQuest.difficulty_level}
                            onChange={(e) => handleEditFieldChange('difficulty_level', e.target.value)}
                            className="input-field w-full"
                          >
                            <option value="beginner">Beginner</option>
                            <option value="intermediate">Intermediate</option>
                            <option value="advanced">Advanced</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Effort Level</label>
                          <select
                            value={editingQuest.effort_level}
                            onChange={(e) => handleEditFieldChange('effort_level', e.target.value)}
                            className="input-field w-full"
                          >
                            <option value="light">Light</option>
                            <option value="moderate">Moderate</option>
                            <option value="intensive">Intensive</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Estimated Hours</label>
                          <input
                            type="number"
                            value={editingQuest.estimated_hours}
                            onChange={(e) => handleEditFieldChange('estimated_hours', parseInt(e.target.value))}
                            className="input-field w-full"
                            min="1"
                            max="50"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Suggested Evidence</label>
                        <textarea
                          value={editingQuest.evidence_requirements}
                          onChange={(e) => handleEditFieldChange('evidence_requirements', e.target.value)}
                          className="input-field w-full h-16"
                          placeholder="Suggestions for how students can validate their learning"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Example Submissions</label>
                        <textarea
                          value={editingQuest.example_submissions}
                          onChange={(e) => handleEditFieldChange('example_submissions', e.target.value)}
                          className="input-field w-full h-16"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">XP Awards</label>
                        {editingQuest.skill_xp_awards?.map((award, idx) => (
                          <div key={idx} className="flex gap-2 mb-2 items-center">
                            <select
                              value={award.skill_category}
                              onChange={(e) => handleSkillXpChange(idx, 'skill_category', e.target.value)}
                              className="input-field flex-1"
                            >
                              {Object.keys(skillCategoryNames).map(key => (
                                <option key={key} value={key}>{skillCategoryNames[key]}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              value={award.xp_amount}
                              onChange={(e) => handleSkillXpChange(idx, 'xp_amount', parseInt(e.target.value))}
                              className="input-field w-20"
                              min="10"
                              max="300"
                            />
                            <button
                              onClick={() => removeSkillXpAward(idx)}
                              className="text-red-500 hover:text-red-700 px-2"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={addSkillXpAward}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          + Add XP Award
                        </button>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Core Skills (comma-separated)</label>
                        <input
                          type="text"
                          value={editingQuest.core_skills?.join(', ') || ''}
                          onChange={(e) => handleEditFieldChange('core_skills', e.target.value.split(', ').map(s => s.trim()).filter(s => s))}
                          className="input-field w-full"
                          placeholder="reading, writing, critical_thinking..."
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Resources Needed</label>
                          <input
                            type="text"
                            value={editingQuest.resources_needed || ''}
                            onChange={(e) => handleEditFieldChange('resources_needed', e.target.value)}
                            className="input-field w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Location Requirements</label>
                          <input
                            type="text"
                            value={editingQuest.location_requirements || ''}
                            onChange={(e) => handleEditFieldChange('location_requirements', e.target.value)}
                            className="input-field w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Safety Considerations</label>
                          <input
                            type="text"
                            value={editingQuest.safety_considerations || ''}
                            onChange={(e) => handleEditFieldChange('safety_considerations', e.target.value)}
                            className="input-field w-full"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Ideas for Collaboration</label>
                        <textarea
                          value={editingQuest.collaboration_ideas || ''}
                          onChange={(e) => handleEditFieldChange('collaboration_ideas', e.target.value)}
                          className="input-field w-full h-20"
                          placeholder="Suggestions for how students can collaborate to earn 2x XP bonus"
                        />
                      </div>

                      <div>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={editingQuest.requires_adult_supervision}
                            onChange={(e) => handleEditFieldChange('requires_adult_supervision', e.target.checked)}
                            className="mr-2"
                          />
                          Requires Adult Supervision
                        </label>
                      </div>

                      <div className="flex gap-4 pt-4">
                        <button
                          onClick={handleCancelEdit}
                          className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">{currentQuest.title}</h3>
                        <p className="text-gray-700 mt-2">{currentQuest.description}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className={`px-3 py-1 text-xs font-medium rounded ${
                          currentQuest.difficulty_level === 'beginner' ? 'bg-green-100 text-green-800' :
                          currentQuest.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {currentQuest.difficulty_level}
                        </span>
                        <span className={`px-3 py-1 text-xs font-medium rounded ${
                          currentQuest.effort_level === 'light' ? 'bg-blue-100 text-blue-800' :
                          currentQuest.effort_level === 'moderate' ? 'bg-orange-100 text-orange-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {currentQuest.effort_level} effort
                        </span>
                        <span className="px-3 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">
                          ~{currentQuest.estimated_hours} hours
                        </span>
                        {currentQuest.requires_adult_supervision && (
                          <span className="px-3 py-1 text-xs font-medium rounded bg-red-100 text-red-700">
                            Adult Supervision Required
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-600 mb-2">Suggested Evidence</h4>
                          <p className="text-sm text-gray-700">{currentQuest.evidence_requirements}</p>
                        </div>
                        
                        <div>
                          <h4 className="text-sm font-semibold text-gray-600 mb-2">Example Submissions</h4>
                          <p className="text-sm text-gray-700">{currentQuest.example_submissions}</p>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-gray-600 mb-2">XP Awards</h4>
                        <div className="flex flex-wrap gap-2">
                          {currentQuest.skill_xp_awards?.map((award, idx) => (
                            <span key={idx} className="bg-white px-3 py-1 rounded-full text-xs border">
                              {skillCategoryNames[award.skill_category] || award.skill_category}: <strong>{award.xp_amount} XP</strong>
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-gray-600 mb-2">Core Skills</h4>
                        <div className="flex flex-wrap gap-1">
                          {currentQuest.core_skills?.map((skill, idx) => (
                            <span key={idx} className="bg-gray-100 px-2 py-1 rounded text-xs">
                              {skill.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>

                      {currentQuest.accepted_evidence_types && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-600 mb-2">Accepted Evidence Types</h4>
                          <div className="flex flex-wrap gap-1">
                            {currentQuest.accepted_evidence_types.map((type, idx) => (
                              <span key={idx} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">
                                {type}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {currentQuest.collaboration_ideas && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-600 mb-2">Ideas for Collaboration (2x XP Bonus)</h4>
                          <p className="text-sm text-gray-700 bg-green-50 p-3 rounded">{currentQuest.collaboration_ideas}</p>
                        </div>
                      )}

                      {currentQuest.optional_challenges?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-600 mb-2">Optional Challenges</h4>
                          {currentQuest.optional_challenges.map((challenge, idx) => (
                            <div key={idx} className="bg-white rounded p-2 mb-1">
                              <p className="text-sm">{challenge.description}</p>
                              <span className="text-xs text-gray-600">
                                +{challenge.xp_amount} XP in {skillCategoryNames[challenge.skill_category] || challenge.skill_category}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {currentQuest.resources_needed && (
                          <div>
                            <span className="font-semibold text-gray-600">Resources: </span>
                            <span className="text-gray-700">{currentQuest.resources_needed}</span>
                          </div>
                        )}
                        {currentQuest.location_requirements && (
                          <div>
                            <span className="font-semibold text-gray-600">Location: </span>
                            <span className="text-gray-700">{currentQuest.location_requirements}</span>
                          </div>
                        )}
                        {currentQuest.safety_considerations && (
                          <div className="col-span-2">
                            <span className="font-semibold text-yellow-600">Safety: </span>
                            <span className="text-gray-700">{currentQuest.safety_considerations}</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {!isEditing && (
                <div className="flex justify-between gap-4">
                  <button
                    onClick={handleReject}
                    className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                    disabled={loading}
                  >
                    ❌ Reject & Next
                  </button>
                  <button
                    onClick={handleEdit}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    disabled={loading}
                  >
                    ✏️ Edit Quest
                  </button>
                  <button
                    onClick={handleAccept}
                    className="flex-1 px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                    disabled={loading}
                  >
                    {loading ? 'Creating...' : '✅ Accept & Create Quest'}
                  </button>
                </div>
              )}

              <div className="flex justify-center">
                <div className="flex gap-1">
                  {generatedQuests.map((_, idx) => (
                    <div
                      key={idx}
                      className={`w-2 h-2 rounded-full ${
                        idx === currentQuestIndex ? 'bg-primary' : 
                        idx < currentQuestIndex ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AIQuestGenerator