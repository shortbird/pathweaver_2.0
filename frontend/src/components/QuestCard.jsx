import React from 'react'
import { Link } from 'react-router-dom'
import { getPillarName, getPillarColor } from '../utils/pillarMappings'

const QuestCard = ({ quest, isCompleted }) => {
  const totalXP = quest.quest_skill_xp?.reduce((sum, award) => sum + award.xp_amount, 0) || 0
  
  const getIntensityBadge = (level) => {
    const colors = {
      light: 'bg-green-100 text-green-800',
      moderate: 'bg-yellow-100 text-yellow-800',
      intensive: 'bg-red-100 text-red-800'
    }
    return colors[level] || 'bg-gray-100 text-gray-800'
  }

  // Fallback for old difficulty/effort fields
  const getDifficultyBadge = (level) => {
    const colors = {
      beginner: 'bg-green-100 text-green-800',
      intermediate: 'bg-yellow-100 text-yellow-800',
      advanced: 'bg-red-100 text-red-800'
    }
    return colors[level] || 'bg-gray-100 text-gray-800'
  }

  return (
    <Link to={`/quests/${quest.id}`} className="block">
      <div className="card hover:shadow-lg transition-shadow duration-200">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-semibold text-gray-900 flex-1 pr-2">{quest.title}</h3>
          <div className="flex gap-2 flex-shrink-0">
            {isCompleted && (
              <span className="bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                ✓ Completed
              </span>
            )}
            {quest.requires_adult_supervision && (
              <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                Adult Supervision
              </span>
            )}
          </div>
        </div>
        
        <p className="text-gray-600 text-sm mb-3 line-clamp-2">
          {quest.big_idea || quest.description}
        </p>
        
        <div className="flex flex-wrap gap-2 mb-3">
          {/* Show primary pillar if available */}
          {quest.primary_pillar && (
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${getPillarColor(quest.primary_pillar)}`}>
              {getPillarName(quest.primary_pillar)}
            </span>
          )}
          
          {/* Show intensity or old difficulty/effort */}
          {quest.intensity ? (
            <span className={`text-xs px-2 py-1 rounded ${getIntensityBadge(quest.intensity)}`}>
              {quest.intensity}
            </span>
          ) : (
            <>
              {quest.difficulty_level && (
                <span className={`text-xs px-2 py-1 rounded ${getDifficultyBadge(quest.difficulty_level)}`}>
                  {quest.difficulty_level}
                </span>
              )}
              {quest.effort_level && (
                <span className={`text-xs px-2 py-1 rounded ${getIntensityBadge(quest.effort_level)}`}>
                  {quest.effort_level}
                </span>
              )}
            </>
          )}
          
          {/* Show time estimate */}
          {quest.estimated_time ? (
            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-800">
              {quest.estimated_time}
            </span>
          ) : quest.estimated_hours ? (
            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-800">
              ~{quest.estimated_hours}h
            </span>
          ) : null}
        </div>
        
        {/* Show XP awards */}
        <div className="flex flex-wrap gap-2 mb-3">
          {quest.quest_skill_xp?.map((award, index) => (
            <span
              key={index}
              className={`text-xs px-2 py-1 rounded-full ${getPillarColor(award.skill_category)}`}
            >
              {getPillarName(award.skill_category)} ({award.xp_amount} XP)
            </span>
          ))}
        </div>

        {/* Show deliverables if available */}
        {quest.what_youll_create && quest.what_youll_create.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-gray-500 mb-1">What you'll create:</p>
            <div className="flex flex-wrap gap-1">
              {quest.what_youll_create.slice(0, 3).map((item, index) => (
                <span key={index} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                  {item}
                </span>
              ))}
              {quest.what_youll_create.length > 3 && (
                <span className="text-xs text-gray-500">+{quest.what_youll_create.length - 3} more</span>
              )}
            </div>
          </div>
        )}
        
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-primary">Total XP: {totalXP}</span>
            {quest.primary_pillar && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPillarColor(quest.primary_pillar)}`}>
                {getPillarName(quest.primary_pillar)}
              </span>
            )}
          </div>
          <span className="text-primary text-sm font-medium">View Details →</span>
        </div>
      </div>
    </Link>
  )
}

export default QuestCard