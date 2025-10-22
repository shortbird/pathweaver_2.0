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
        <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full max-h-[85vh] overflow-y-auto">
          {/* Header with Pillar Color */}
          <div
            className="px-8 py-8"
            style={{ backgroundColor: pillarData.color }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-sm font-semibold uppercase tracking-wide text-white/90 mb-2" style={{ fontFamily: 'Poppins' }}>
                  {pillarData.name}
                </div>
                <h3 className="text-3xl font-bold text-white mb-4" style={{ fontFamily: 'Poppins' }}>{task.title}</h3>
                <div className="flex items-center gap-3">
                  <div className="px-6 py-2 bg-white/20 backdrop-blur-sm text-white rounded-full text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'Poppins' }}>
                    <Award className="w-5 h-5" />
                    {task.xp_amount || task.xp_value} XP
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="ml-4 text-white hover:text-white/80 transition-colors"
              >
                <X className="w-8 h-8" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-8 py-6 space-y-6">
            {/* Description */}
            {task.description && (
              <div
                className="rounded-xl p-6 border-2"
                style={{
                  backgroundColor: `${pillarData.color}10`,
                  borderColor: `${pillarData.color}50`
                }}
              >
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2" style={{ color: pillarData.color, fontFamily: 'Poppins' }}>
                  <BookOpen className="w-5 h-5" />
                  Description
                </h4>
                <p className="text-gray-700 text-base leading-relaxed" style={{ fontFamily: 'Poppins' }}>{task.description}</p>
              </div>
            )}

            {/* Bullet Points */}
            {task.bullet_points && task.bullet_points.length > 0 && (
              <div
                className="rounded-xl p-6 border-2"
                style={{
                  backgroundColor: `${pillarData.color}10`,
                  borderColor: pillarData.color
                }}
              >
                <h4 className="font-bold text-lg mb-4" style={{ color: pillarData.color, fontFamily: 'Poppins' }}>What You'll Do</h4>
                <ul className="space-y-3">
                  {task.bullet_points.map((point, idx) => (
                    <li key={idx} className="flex items-start">
                      <span className="mr-3 mt-1 text-xl font-bold" style={{ color: pillarData.color }}>•</span>
                      <span className="text-gray-700 text-base leading-relaxed" style={{ fontFamily: 'Poppins' }}>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* School Subjects */}
            {task.school_subjects && (typeof task.school_subjects === 'object' ? Object.keys(task.school_subjects).length > 0 : task.school_subjects.length > 0) && (
              <div
                className="rounded-xl p-6 border-2"
                style={{
                  backgroundColor: `${pillarData.color}10`,
                  borderColor: `${pillarData.color}50`
                }}
              >
                <h4 className="font-bold text-lg mb-3" style={{ color: pillarData.color, fontFamily: 'Poppins' }}>Diploma Credits</h4>
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
                        className="px-3 py-1.5 rounded-full text-sm font-semibold border-2"
                        style={{
                          backgroundColor: `${pillarData.color}20`,
                          color: pillarData.color,
                          borderColor: pillarData.color,
                          fontFamily: 'Poppins'
                        }}
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
              <div
                className="border-2 rounded-xl p-6"
                style={{
                  backgroundColor: `${pillarData.color}10`,
                  borderColor: pillarData.color
                }}
              >
                <h4 className="font-bold text-lg mb-3" style={{ color: pillarData.color, fontFamily: 'Poppins' }}>Evidence Ideas</h4>
                <p className="text-gray-700 text-base leading-relaxed" style={{ fontFamily: 'Poppins' }}>{task.evidence_prompt}</p>
              </div>
            )}

            {/* Materials Needed */}
            {task.materials_needed && task.materials_needed.length > 0 && (
              <div
                className="border-2 rounded-xl p-6"
                style={{
                  backgroundColor: `${pillarData.color}10`,
                  borderColor: `${pillarData.color}50`
                }}
              >
                <h4 className="font-bold text-lg mb-3" style={{ color: pillarData.color, fontFamily: 'Poppins' }}>Materials Needed</h4>
                <ul className="space-y-2">
                  {task.materials_needed.map((material, idx) => (
                    <li key={idx} className="flex items-center text-base text-gray-700" style={{ fontFamily: 'Poppins' }}>
                      <div className="w-2.5 h-2.5 rounded-full mr-3" style={{ backgroundColor: pillarData.color }}></div>
                      {material}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-8 py-6">
            <button
              onClick={onClose}
              className="w-full px-6 py-3 text-white rounded-lg hover:shadow-xl transition-all font-bold text-lg"
              style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
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
