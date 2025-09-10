import React, { useState } from 'react';
import Button from '../../ui/Button';
import { getPillarData, getPillarGradient } from '../../../utils/pillarMappings';

const TaskCard = ({ task, index, isCompleted, isEnrolled, onComplete, hasCollaboration }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Get pillar data safely
  const pillarData = getPillarData(task.pillar);
  const style = {
    gradient: getPillarGradient(task.pillar),
    bg: pillarData.bg.replace('100', '50'),
    border: pillarData.bg.replace('bg-', 'border-').replace('100', '200'),
    text: pillarData.text,
    icon: pillarData.icon
  };
  const effectiveXP = hasCollaboration && task.is_collaboration_eligible 
    ? task.xp_amount * 2 
    : task.xp_amount;

  return (
    <div 
      className={`
        relative rounded-xl transition-all duration-300 overflow-hidden
        ${isCompleted 
          ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300' 
          : `bg-white border-2 ${style.border} hover:shadow-lg hover:-translate-y-0.5`
        }
      `}
    >
      {/* Task Number Badge */}
      <div className={`absolute -top-2 -left-2 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white bg-gradient-to-r ${style.gradient} shadow-lg`}>
        {isCompleted ? (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          index + 1
        )}
      </div>

      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 pl-6">
            <h3 className={`text-lg font-semibold ${isCompleted ? 'text-green-700' : 'text-gray-900'} mb-1`}>
              {task.title}
            </h3>
            
            {/* Description - Expandable */}
            {task.description && (
              <div>
                <p className={`text-sm text-gray-600 ${!isExpanded ? 'line-clamp-2' : ''}`}>
                  {task.description}
                </p>
                {task.description.length > 100 && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-sm text-[#6d469b] hover:text-[#5c3a82] font-medium mt-1"
                  >
                    {isExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* XP and Skill Badge Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Skill Pillar Badge */}
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${style.bg} ${style.text} text-sm font-medium`}>
              <span>{style.icon}</span>
              <span className="capitalize">{task.pillar.replace('_', ' ')}</span>
            </div>

            {/* School Subjects Badge */}
            {task.school_subjects && task.school_subjects.length > 0 && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs">
                <span>📚</span>
                <span>
                  {task.school_subjects.map(subject => {
                    const subjectNames = {
                      'language_arts': 'Language Arts',
                      'math': 'Math',
                      'science': 'Science',
                      'social_studies': 'Social Studies',
                      'financial_literacy': 'Financial Literacy',
                      'health': 'Health',
                      'pe': 'PE',
                      'fine_arts': 'Fine Arts',
                      'cte': 'CTE',
                      'digital_literacy': 'Digital Literacy',
                      'electives': 'Electives'
                    };
                    return subjectNames[subject] || subject;
                  }).slice(0, 2).join(', ')}
                  {task.school_subjects.length > 2 && ` +${task.school_subjects.length - 2}`}
                </span>
              </div>
            )}

            {/* XP Badge with Animation */}
            <div className="relative">
              <div className={`
                inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-bold text-sm
                ${isCompleted 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-gray-100 text-gray-700'
                }
              `}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span>{task.xp_amount} XP</span>
              </div>
              
              {/* Collaboration Bonus Indicator */}
              {hasCollaboration && task.is_collaboration_eligible && !isCompleted && (
                <div className="absolute -top-2 -right-2 bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-md animate-pulse">
                  ×2
                </div>
              )}
            </div>

            {/* Show effective XP if collaboration active */}
            {hasCollaboration && task.is_collaboration_eligible && !isCompleted && (
              <div className="text-sm font-medium text-purple-600">
                = {effectiveXP} XP total!
              </div>
            )}
          </div>

          {/* Action Button */}
          {isEnrolled && !isCompleted && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onComplete(task)}
              className="min-w-[100px]"
            >
              Complete
            </Button>
          )}

          {/* Completed Status */}
          {isCompleted && (
            <div className="flex items-center gap-2 text-green-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">Completed</span>
            </div>
          )}
        </div>

        {/* Progress Indicator for Required Tasks */}
        {task.is_required && !isCompleted && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs text-orange-600">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Required task</span>
            </div>
          </div>
        )}
      </div>

      {/* Completion Animation Overlay */}
      {isCompleted && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-2 right-2">
            <svg className="w-16 h-16 text-green-500 opacity-20" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskCard;