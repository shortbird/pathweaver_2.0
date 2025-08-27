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
              {quest.primary_pillar && (
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPillarColor(quest.primary_pillar)}`}>
                  {totalXP} XP • {quest.primary_pillar.replace(/_/g, ' ')}
                </span>
              )}
              {quest.quest_skill_xp?.filter(xp => xp.skill_category !== quest.primary_pillar).map((xp, index) => (
                <span key={index} className={`px-2 py-1 rounded-full text-xs font-medium ${getPillarColor(xp.skill_category)}`}>
                  +{xp.xp_amount} {xp.skill_category.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
            {quest.collaboration_spark && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Collaboration: 2x XP</span>
              </div>
            )}
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
                setExpandedSections(prev => ({ ...prev, process: true }))
                setShowSubmissionForm(true)
                // Scroll to the process section after a brief delay
                setTimeout(() => {
                  document.querySelector('.process-section')?.scrollIntoView({ behavior: 'smooth' })
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
        {/* The Process Section */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden process-section">
          <button
            onClick={() => toggleSection('process')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{expandedSections.process ? '▼' : '▶'}</span>
              <span className="text-xl font-bold">The Process</span>
            </div>
          </button>
          
          {expandedSections.process && (
            <div className="px-6 pb-6">
              {/* What You'll Create */}
              {quest.what_youll_create && quest.what_youll_create.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-semibold mb-2">Deliverables</h3>
                  <ul className="space-y-1">
                    {quest.what_youll_create.map((item, index) => (
                      <li key={index} className="text-gray-700 text-sm pl-4">
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Your Process */}
              {quest.your_mission && quest.your_mission.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-semibold mb-2">Steps</h3>
                  <ol className="space-y-2">
                    {quest.your_mission.map((step, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-primary font-medium">{index + 1}.</span>
                        <span className="text-gray-700 text-sm">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Resources - Only show first 3 */}
              {quest.helpful_resources && Array.isArray(quest.helpful_resources) && quest.helpful_resources.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-2 text-sm text-gray-600">Resources</h3>
                  <div className="space-y-1">
                    {quest.helpful_resources.slice(0, 3).map((resource, index) => (
                      <div key={index} className="text-sm">
                        {resource.url ? (
                          <a href={resource.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {resource.name}
                          </a>
                        ) : (
                          <span className="text-gray-700">{resource.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Important Note */}
              {quest.heads_up && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mt-4">
                  <p className="text-sm text-gray-700">💡 {quest.heads_up}</p>
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
              <span className="text-xl font-bold">Go Further</span>
            </div>
          </button>
          
          {expandedSections.further && (
            <div className="px-6 pb-6">
              {/* Collaboration */}
              {quest.collaboration_spark && (
                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-bold text-lg mb-2">Collaboration</h3>
                  <p className="text-gray-700">{quest.collaboration_spark}</p>
                  <span className="text-sm text-blue-600 mt-2 inline-block">2x XP when working with others</span>
                </div>
              )}

              {/* Extensions */}
              {quest.real_world_bonus && Array.isArray(quest.real_world_bonus) && quest.real_world_bonus.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-bold mb-2">Extensions</h3>
                  {quest.real_world_bonus.map((bonus, index) => (
                    <div key={index} className="bg-purple-50 rounded-lg p-3 mb-2">
                      <p className="text-sm text-gray-700">{bonus.description}</p>
                      <span className="text-xs text-purple-600">+{bonus.xp_amount} XP</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Learning Log */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <h3 className="font-bold text-lg mb-2">Learning Log</h3>
                <p className="text-gray-700 mb-2">Keep a regular written record of your process throughout this quest. Document your discoveries, challenges, and reflections as you work.</p>
                {quest.log_bonus && quest.log_bonus.prompt && (
                  <p className="text-gray-700 mb-2 italic">{quest.log_bonus.prompt}</p>
                )}
                <span className="text-sm text-green-600 inline-block">+{quest.log_bonus?.xp_amount || 25} XP bonus</span>
                
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