import React from 'react'
import { Link } from 'react-router-dom'

const QuestCard = ({ quest, isCompleted }) => {
  const totalXP = quest.quest_skill_xp?.reduce((sum, award) => sum + award.xp_amount, 0) || 0
  
  const skillCategoryColors = {
    reading_writing: 'bg-blue-100 text-blue-800',
    thinking_skills: 'bg-purple-100 text-purple-800',
    personal_growth: 'bg-green-100 text-green-800',
    life_skills: 'bg-yellow-100 text-yellow-800',
    making_creating: 'bg-orange-100 text-orange-800',
    world_understanding: 'bg-pink-100 text-pink-800'
  }

  const skillCategoryNames = {
    reading_writing: 'Reading & Writing',
    thinking_skills: 'Thinking Skills',
    personal_growth: 'Personal Growth',
    life_skills: 'Life Skills',
    making_creating: 'Making & Creating',
    world_understanding: 'World Understanding'
  }

  const getDifficultyBadge = (level) => {
    const colors = {
      beginner: 'bg-green-100 text-green-800',
      intermediate: 'bg-yellow-100 text-yellow-800',
      advanced: 'bg-red-100 text-red-800'
    }
    return colors[level] || 'bg-gray-100 text-gray-800'
  }

  const getEffortBadge = (level) => {
    const colors = {
      light: 'bg-blue-100 text-blue-800',
      moderate: 'bg-orange-100 text-orange-800',
      intensive: 'bg-purple-100 text-purple-800'
    }
    return colors[level] || 'bg-gray-100 text-gray-800'
  }

  return (
    <Link to={`/quests/${quest.id}`} className="block">
      <div className="card hover:shadow-lg transition-shadow duration-200">
        {isCompleted && (
          <div className="mb-3 flex justify-end">
            <span className="bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
              ✓ Completed
            </span>
          </div>
        )}
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-semibold text-gray-900 flex-1 pr-2">{quest.title}</h3>
          {quest.requires_adult_supervision && (
            <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full flex-shrink-0">
              Adult Supervision
            </span>
          )}
        </div>
        
        <p className="text-gray-600 text-sm mb-3 line-clamp-2">{quest.description}</p>
        
        <div className="flex flex-wrap gap-2 mb-3">
          {quest.difficulty_level && (
            <span className={`text-xs px-2 py-1 rounded ${getDifficultyBadge(quest.difficulty_level)}`}>
              {quest.difficulty_level}
            </span>
          )}
          {quest.effort_level && (
            <span className={`text-xs px-2 py-1 rounded ${getEffortBadge(quest.effort_level)}`}>
              {quest.effort_level}
            </span>
          )}
          {quest.estimated_hours && (
            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-800">
              ~{quest.estimated_hours}h
            </span>
          )}
        </div>
        
        <div className="flex flex-wrap gap-2 mb-3">
          {quest.quest_skill_xp?.map((award, index) => (
            <span
              key={index}
              className={`text-xs px-2 py-1 rounded-full ${skillCategoryColors[award.skill_category] || 'bg-gray-100 text-gray-800'}`}
            >
              {skillCategoryNames[award.skill_category] || award.skill_category} ({award.xp_amount} XP)
            </span>
          ))}
        </div>

        {quest.core_skills && quest.core_skills.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-gray-500 mb-1">Skills developed:</p>
            <div className="flex flex-wrap gap-1">
              {quest.core_skills.slice(0, 5).map((skill, index) => (
                <span key={index} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                  {skill.replace(/_/g, ' ')}
                </span>
              ))}
              {quest.core_skills.length > 5 && (
                <span className="text-xs text-gray-500">+{quest.core_skills.length - 5} more</span>
              )}
            </div>
          </div>
        )}
        
        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold text-primary">Total XP: {totalXP}</span>
          <span className="text-primary text-sm font-medium">View Details →</span>
        </div>
      </div>
    </Link>
  )
}

export default QuestCard