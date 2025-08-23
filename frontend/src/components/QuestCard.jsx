import React from 'react'
import { Link } from 'react-router-dom'

const QuestCard = ({ quest }) => {
  const totalXP = quest.quest_xp_awards?.reduce((sum, award) => sum + award.xp_amount, 0) || 0
  
  const subjectColors = {
    language_arts: 'bg-blue-100 text-blue-800',
    math: 'bg-red-100 text-red-800',
    science: 'bg-green-100 text-green-800',
    social_studies: 'bg-yellow-100 text-yellow-800',
    foreign_language: 'bg-purple-100 text-purple-800',
    arts: 'bg-pink-100 text-pink-800',
    technology: 'bg-indigo-100 text-indigo-800',
    physical_education: 'bg-orange-100 text-orange-800'
  }

  return (
    <Link to={`/quests/${quest.id}`} className="block">
      <div className="card hover:shadow-lg transition-shadow duration-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{quest.title}</h3>
        <p className="text-gray-600 text-sm mb-4 line-clamp-2">{quest.description}</p>
        
        <div className="flex flex-wrap gap-2 mb-3">
          {quest.quest_xp_awards?.map((award, index) => (
            <span
              key={index}
              className={`text-xs px-2 py-1 rounded-full ${subjectColors[award.subject] || 'bg-gray-100 text-gray-800'}`}
            >
              {award.subject.replace('_', ' ')} ({award.xp_amount} XP)
            </span>
          ))}
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Total XP: {totalXP}</span>
          <span className="text-primary text-sm font-medium">View Details →</span>
        </div>
      </div>
    </Link>
  )
}

export default QuestCard