import React, { useState } from 'react'
import QuestSubmissionForm from './QuestSubmissionForm'

const VisualQuestCard = ({ quest, userQuest, onStartQuest, onSubmitQuest, onAddLog, learningLogs = [] }) => {
  const [expandedSections, setExpandedSections] = useState({})
  const [showSubmissionForm, setShowSubmissionForm] = useState(false)
  const [evidenceText, setEvidenceText] = useState('')
  const [newLogEntry, setNewLogEntry] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [addingLog, setAddingLog] = useState(false)

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const getPillarColor = (pillar) => {
    const colors = {
      creativity: 'bg-[#FFCA3A] text-black',
      critical_thinking: 'bg-[#8B5CF6] text-white',
      practical_skills: 'bg-[#F97316] text-white',
      communication: 'bg-[#3B82F6] text-white',
      cultural_literacy: 'bg-[#10B981] text-white'
    }
    return colors[pillar] || 'bg-gray-500 text-white'
  }

  const totalXP = quest.total_xp || quest.quest_skill_xp?.reduce((sum, award) => sum + award.xp_amount, 0) || 0

  return (
    <div className="max-w-4xl mx-auto">
      {/* Quest Header - Always Visible */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
        {/* Banner Image (if available) */}
        {quest.quest_banner_image && (
          <div className="h-48 bg-gradient-to-r from-blue-400 to-purple-500">
            <img 
              src={quest.quest_banner_image} 
              alt={quest.title}
              className="w-full h-full object-cover opacity-80"
            />
          </div>
        )}
        
        <div className="p-6">
          {/* Pillar Icon and Title */}
          <div className="flex items-start gap-4 mb-4">
            <div className={`text-4xl p-3 rounded-lg ${getPillarColor(quest.primary_pillar)}`}>
              {quest.primary_pillar_icon}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">{quest.title}</h1>
            </div>
          </div>

          {/* Big Idea */}
          <p className="text-lg text-gray-700 mb-6">
            {quest.big_idea}
          </p>

          {/* Key Info Bar */}
          <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⏱️</span>
              <span className="font-medium">{quest.estimated_time}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">✨</span>
              <span className="font-medium">{totalXP} XP</span>
              {quest.primary_pillar && (
                <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${getPillarColor(quest.primary_pillar)}`}>
                  {quest.primary_pillar.replace('_', ' ')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">👥</span>
              <span className="font-medium">{quest.collaboration_bonus || '2x XP Bonus'}</span>
            </div>
          </div>

          {/* Action Buttons */}
          {!userQuest && (
            <button 
              onClick={onStartQuest}
              className="mt-6 w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 px-6 rounded-lg transition"
            >
              Start Quest
            </button>
          )}
          {userQuest?.status === 'in_progress' && (
            <button 
              onClick={() => {
                setExpandedSections(prev => ({ ...prev, mission: true }))
                setShowSubmissionForm(true)
                // Scroll to the mission section after a brief delay
                setTimeout(() => {
                  document.querySelector('.mission-section')?.scrollIntoView({ behavior: 'smooth' })
                }, 100)
              }}
              className="mt-6 w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition"
            >
              Finish Quest
            </button>
          )}
        </div>
      </div>

      {/* Core Sections - Collapsible */}
      <div className="space-y-4">
        {/* The Mission Section */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mission-section">
          <button
            onClick={() => toggleSection('mission')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{expandedSections.mission ? '▼' : '▶'}</span>
              <span className="text-2xl">🎯</span>
              <span className="text-xl font-bold">The Mission</span>
            </div>
          </button>
          
          {expandedSections.mission && (
            <div className="px-6 pb-6">
              {/* What You'll Create */}
              {quest.what_youll_create && quest.what_youll_create.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-bold text-lg mb-3">What You'll Create</h3>
                  <div className="space-y-2">
                    {quest.what_youll_create.map((item, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <p className="text-gray-700">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Your Mission */}
              {quest.your_mission && quest.your_mission.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-bold text-lg mb-3">Your Mission</h3>
                  <div className="space-y-3">
                    {quest.your_mission.map((step, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-sm flex-shrink-0">
                          {index + 1}
                        </span>
                        <p className="text-gray-700">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Showcase Your Journey */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="font-bold text-lg mb-2">Showcase Your Journey</h3>
                <p className="text-gray-700">
                  {quest.showcase_your_journey}
                </p>
              </div>

              {/* Helpful Resources */}
              {quest.helpful_resources && Array.isArray(quest.helpful_resources) && quest.helpful_resources.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-bold text-lg mb-2">Helpful Resources</h3>
                  <div className="space-y-2">
                    {quest.helpful_resources.map((resource, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <span className="text-lg">
                          {resource.type === 'Tool' ? '🔧' : resource.type === 'Tutorial' ? '📖' : '💡'}
                        </span>
                        <div>
                          <span className="font-medium">{resource.name}</span>
                          {resource.url && (
                            <a href={resource.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline ml-2">
                              →
                            </a>
                          )}
                          {resource.description && (
                            <p className="text-sm text-gray-600 mt-1">{resource.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Heads Up */}
              {quest.heads_up && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-4">
                  <h3 className="font-bold mb-1">⚠️ Heads Up</h3>
                  <p className="text-gray-700">{quest.heads_up}</p>
                </div>
              )}

              {/* Location */}
              {quest.location && (
                <div className="bg-gray-50 rounded-lg p-4 mt-4">
                  <h3 className="font-bold mb-1">📍 Location</h3>
                  <p className="text-gray-700">{quest.location}</p>
                </div>
              )}

              {/* Submit Evidence (if quest in progress and form is shown) */}
              {userQuest?.status === 'in_progress' && showSubmissionForm && (
                <div className="mt-6 border-t pt-6">
                  <QuestSubmissionForm 
                    onSubmit={async (submissionData, files) => {
                      setSubmitting(true)
                      const success = await onSubmitQuest(submissionData, files)
                      setSubmitting(false)
                      return success
                    }}
                    isSubmitting={submitting}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Go Further Section */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <button
            onClick={() => toggleSection('further')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{expandedSections.further ? '▼' : '▶'}</span>
              <span className="text-2xl">✨</span>
              <span className="text-xl font-bold">Go Further</span>
            </div>
          </button>
          
          {expandedSections.further && (
            <div className="px-6 pb-6">
              {/* Collaboration Spark */}
              {quest.collaboration_spark && (
                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-bold text-lg mb-2">👥 Collaboration Spark</h3>
                  <p className="text-gray-700">{quest.collaboration_spark}</p>
                  <span className="text-sm text-blue-600 mt-2 inline-block">Earn 2x XP when working with others!</span>
                </div>
              )}

              {/* Real World Bonus */}
              {quest.real_world_bonus && Array.isArray(quest.real_world_bonus) && quest.real_world_bonus.length > 0 && (
                <div className="space-y-3 mb-4">
                  <h3 className="font-bold text-lg">Real World Bonus</h3>
                  {quest.real_world_bonus.map((bonus, index) => (
                    <div key={index} className="bg-purple-50 rounded-lg p-4">
                      <p className="text-gray-700">{bonus.description}</p>
                      <span className="text-sm text-purple-600 mt-2 inline-block">+{bonus.xp_amount} XP</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Learning Log - Moved Here */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <h3 className="font-bold text-lg mb-2">📓 Learning Log</h3>
                {quest.log_bonus && (
                  <p className="text-gray-700 mb-2">{quest.log_bonus.prompt || quest.log_bonus.description}</p>
                )}
                <span className="text-sm text-green-600 inline-block">+{quest.log_bonus?.xp_amount || 25} XP for documenting your journey</span>
                
                {/* Add Log Entry (if quest in progress) */}
                {userQuest?.status === 'in_progress' && (
                  <div className="mt-4">
                    <textarea
                      value={newLogEntry}
                      onChange={(e) => setNewLogEntry(e.target.value)}
                      placeholder="Document your journey... What did you discover? What challenged you?"
                      className="w-full p-3 border rounded-lg h-24 bg-white"
                    />
                    <button
                      onClick={() => onAddLog(newLogEntry)}
                      disabled={addingLog || !newLogEntry.trim()}
                      className="mt-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-50"
                    >
                      {addingLog ? 'Adding...' : `Add Log Entry (+${quest.log_bonus?.xp_amount || 25} XP)`}
                    </button>
                  </div>
                )}

                {/* Previous Logs */}
                {learningLogs.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h4 className="font-semibold text-sm">Your Journey So Far:</h4>
                    {learningLogs.map((log, index) => (
                      <div key={log.id || index} className="bg-white rounded-lg p-3 border border-green-100">
                        <p className="text-gray-700 text-sm">{log.log_entry}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(log.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default VisualQuestCard