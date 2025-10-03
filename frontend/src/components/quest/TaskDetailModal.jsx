import React from 'react';
import { X, Award, BookOpen } from 'lucide-react';
import { getPillarData } from '../../utils/pillarMappings';

const TaskDetailModal = ({ task, isOpen, onClose }) => {
  if (!isOpen || !task) return null;

  const pillarData = getPillarData(task.pillar);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        ></div>

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] px-6 py-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-2">{task.title}</h3>
                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${pillarData.bg} ${pillarData.text}`}>
                    {pillarData.icon} {pillarData.name}
                  </div>
                  <div className="px-3 py-1 bg-white/20 text-white rounded-full text-xs font-medium flex items-center gap-1">
                    <Award className="w-3 h-3" />
                    {task.xp_amount || task.xp_value} XP
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="ml-4 text-white hover:text-gray-200 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4">
            {/* Description */}
            {task.description && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#ef597b]" />
                  Description
                </h4>
                <p className="text-gray-700">{task.description}</p>
              </div>
            )}

            {/* Bullet Points */}
            {task.bullet_points && task.bullet_points.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">What You'll Do</h4>
                <ul className="space-y-2">
                  {task.bullet_points.map((point, idx) => (
                    <li key={idx} className="flex items-start">
                      <span className="text-green-500 mr-2 mt-1">•</span>
                      <span className="text-gray-700">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* School Subjects */}
            {task.school_subjects && task.school_subjects.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Diploma Credits</h4>
                <div className="flex flex-wrap gap-2">
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

                    return (
                      <div
                        key={subject}
                        className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium border border-blue-100"
                      >
                        {subjectNames[subject] || subject}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Evidence Prompt */}
            {task.evidence_prompt && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h4 className="font-semibold text-purple-900 mb-2">Evidence Ideas</h4>
                <p className="text-purple-700 text-sm">{task.evidence_prompt}</p>
              </div>
            )}

            {/* Materials Needed */}
            {task.materials_needed && task.materials_needed.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h4 className="font-semibold text-orange-900 mb-2">Materials Needed</h4>
                <ul className="space-y-1">
                  {task.materials_needed.map((material, idx) => (
                    <li key={idx} className="flex items-center text-sm text-orange-700">
                      <div className="w-2 h-2 bg-orange-400 rounded-full mr-2"></div>
                      {material}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:shadow-lg transition-all font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailModal;
