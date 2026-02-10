/**
 * ReportQuestSelector - Multi-select component for quests/courses
 *
 * Displays available quests and courses for the user to include in
 * their evidence report. Shows quest completion status and task counts.
 */

import React from 'react';
import PropTypes from 'prop-types';

const ReportQuestSelector = ({
  quests = [],
  courses = [],
  selectedQuestIds = [],
  selectedCourseIds = [],
  onQuestToggle,
  onCourseToggle,
  onSelectAll,
  onClearAll
}) => {
  const hasSelections = selectedQuestIds.length > 0 || selectedCourseIds.length > 0;
  const totalSelectable = quests.length + courses.length;
  const totalSelected = selectedQuestIds.length + selectedCourseIds.length;

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Select Content to Include
          </h3>
          <p className="text-sm text-gray-500">
            {totalSelected} of {totalSelectable} selected
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-sm text-optio-purple hover:text-optio-purple/80 font-medium"
          >
            Select All
          </button>
          {hasSelections && (
            <button
              onClick={onClearAll}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Courses Section */}
      {courses.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">
            Courses
          </h4>
          <div className="space-y-2">
            {courses.map(course => (
              <label
                key={course.id}
                className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedCourseIds.includes(course.id)
                    ? 'border-optio-purple bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedCourseIds.includes(course.id)}
                  onChange={() => onCourseToggle(course.id)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded border-2 mr-4 flex items-center justify-center ${
                  selectedCourseIds.includes(course.id)
                    ? 'bg-optio-purple border-optio-purple'
                    : 'border-gray-300'
                }`}>
                  {selectedCourseIds.includes(course.id) && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{course.title}</div>
                  {course.description && (
                    <div className="text-sm text-gray-500 mt-1 line-clamp-1">
                      {course.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">
                    Course
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Quests Section */}
      {quests.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">
            Quests
          </h4>
          <div className="space-y-2">
            {quests.map(quest => (
              <label
                key={quest.id}
                className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedQuestIds.includes(quest.id)
                    ? 'border-optio-purple bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedQuestIds.includes(quest.id)}
                  onChange={() => onQuestToggle(quest.id)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded border-2 mr-4 flex items-center justify-center ${
                  selectedQuestIds.includes(quest.id)
                    ? 'bg-optio-purple border-optio-purple'
                    : 'border-gray-300'
                }`}>
                  {selectedQuestIds.includes(quest.id) && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{quest.title}</div>
                  {quest.description && (
                    <div className="text-sm text-gray-500 mt-1 line-clamp-1">
                      {quest.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                    {quest.approved_task_count} task{quest.approved_task_count !== 1 ? 's' : ''}
                  </span>
                  {quest.completed_at && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                      Completed
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {quests.length === 0 && courses.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-4 text-sm font-medium text-gray-900">No content available</h3>
          <p className="mt-2 text-sm text-gray-500">
            Complete some quests with approved tasks to create evidence reports.
          </p>
        </div>
      )}
    </div>
  );
};

ReportQuestSelector.propTypes = {
  quests: PropTypes.array,
  courses: PropTypes.array,
  selectedQuestIds: PropTypes.array,
  selectedCourseIds: PropTypes.array,
  onQuestToggle: PropTypes.func.isRequired,
  onCourseToggle: PropTypes.func.isRequired,
  onSelectAll: PropTypes.func,
  onClearAll: PropTypes.func
};

export default ReportQuestSelector;
