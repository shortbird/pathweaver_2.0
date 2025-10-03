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
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full max-h-[85vh] overflow-y-auto">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] px-8 py-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white mb-3">{task.title}</h3>
                <div className="flex items-center gap-3">
                  <div className={`px-4 py-1.5 rounded-full text-sm font-medium ${pillarData.bg} ${pillarData.text}`}>
                    {pillarData.icon} {pillarData.name}
                  </div>
                  <div className="px-4 py-1.5 bg-white/20 text-white rounded-full text-sm font-medium flex items-center gap-1.5">
                    <Award className="w-4 h-4" />
                    {task.xp_amount || task.xp_value} XP
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="ml-4 text-white hover:text-gray-200 transition-colors"
              >
                <X className="w-7 h-7" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-8 py-6 space-y-6">
            {/* Description */}
            {task.description && (
              <div className="bg-gray-50 rounded-lg p-5">
                <h4 className="font-bold text-lg text-gray-900 mb-3 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-[#ef597b]" />
                  Description
                </h4>
                <p className="text-gray-700 text-base leading-relaxed">{task.description}</p>
              </div>
            )}

            {/* Bullet Points */}
            {task.bullet_points && task.bullet_points.length > 0 && (
              <div className="bg-green-50 rounded-lg p-5 border border-green-200">
                <h4 className="font-bold text-lg text-gray-900 mb-3">What You'll Do</h4>
                <ul className="space-y-3">
                  {task.bullet_points.map((point, idx) => (
                    <li key={idx} className="flex items-start">
                      <span className="text-green-600 mr-3 mt-1 text-xl font-bold">•</span>
                      <span className="text-gray-700 text-base leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* School Subjects */}
            {task.school_subjects && (typeof task.school_subjects === 'object' ? Object.keys(task.school_subjects).length > 0 : task.school_subjects.length > 0) && (
              <div className="bg-blue-50 rounded-lg p-5 border border-blue-200">
                <h4 className="font-bold text-lg text-gray-900 mb-3">Diploma Credits</h4>
                <div className="flex flex-wrap gap-2">
                  {(typeof task.school_subjects === 'object' && !Array.isArray(task.school_subjects)
                    ? Object.entries(task.school_subjects)
                    : task.school_subjects.map(s => [s, null])
                  ).map(([subject, xp]) => {
                    const subjectNames = {
                      'Language Arts': 'Language Arts',
                      'Mathematics': 'Math',
                      'Science': 'Science',
                      'Social Studies': 'Social Studies',
                      'Financial Literacy': 'Financial Literacy',
                      'Health': 'Health',
                      'Physical Education': 'PE',
                      'Fine Arts': 'Fine Arts',
                      'Career & Technical Education': 'CTE',
                      'Digital Literacy': 'Digital Literacy',
                      'Electives': 'Electives'
                    };

                    return (
                      <div
                        key={subject}
                        className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium border border-blue-200"
                      >
                        {subjectNames[subject] || subject}{xp ? ` (${xp} XP)` : ''}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Evidence Prompt */}
            {task.evidence_prompt && (
              <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-5">
                <h4 className="font-bold text-lg text-purple-900 mb-3">Evidence Ideas</h4>
                <p className="text-purple-800 text-base leading-relaxed">{task.evidence_prompt}</p>
              </div>
            )}

            {/* Materials Needed */}
            {task.materials_needed && task.materials_needed.length > 0 && (
              <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-5">
                <h4 className="font-bold text-lg text-orange-900 mb-3">Materials Needed</h4>
                <ul className="space-y-2">
                  {task.materials_needed.map((material, idx) => (
                    <li key={idx} className="flex items-center text-base text-orange-800">
                      <div className="w-2.5 h-2.5 bg-orange-500 rounded-full mr-3"></div>
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
