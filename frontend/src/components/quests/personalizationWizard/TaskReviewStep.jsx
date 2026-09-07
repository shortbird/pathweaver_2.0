// Step 4: the AI's tasks, one at a time. Accept, skip, flag, or push the
// complexity dial and have it rewritten easier or harder (capped at
// MAX_ADJUST_STEPS in either direction).
import React from 'react';
import {
  ArrowDownIcon, ArrowUpIcon, CheckCircleIcon, CheckIcon, FlagIcon, XMarkIcon,
} from '@heroicons/react/24/outline';

const TaskReviewStep = ({
  acceptedTasks, adjustingTask, creationMethod, currentTask, currentTaskIndex,
  embedded, generatedTasks, getPillarData, handleAcceptTask, handleAdjustTask,
  handleSkipTask, hideDiplomaSubjects, hidePillars, loading, MAX_ADJUST_STEPS,
  setShowFlagModal, step, taskAdjustments,
}) => (
  <div>
    <div className={embedded ? 'mb-3' : 'mb-6'}>
      <div className="flex items-center justify-between mb-2">
        <h2 className={embedded ? 'text-xl font-bold' : 'text-3xl font-bold'}>Review Tasks</h2>
        <span className={embedded ? 'text-sm font-semibold text-gray-600' : 'text-lg font-semibold text-gray-600'}>
          Task {currentTaskIndex + 1} of {generatedTasks.length}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-green-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${((currentTaskIndex + 1) / generatedTasks.length) * 100}%` }}
        />
      </div>
    </div>

    {/* Task Card */}
    <div className={`bg-white border-2 border-gray-200 relative ${
      embedded ? 'rounded-xl p-4 mb-3 shadow' : 'rounded-2xl p-4 sm:p-8 mb-8 shadow-lg'
    }`}>
      {/* XP Badge - Top Right */}
      <div className={`absolute flex items-center gap-2 bg-green-100 text-green-800 rounded-full ${
        embedded ? 'top-3 right-3 px-2.5 py-1' : 'top-3 right-3 sm:top-6 sm:right-6 px-3 py-1.5 sm:px-4 sm:py-2'
      }`}>
        <span className={embedded ? 'text-xs font-semibold' : 'text-sm sm:text-base font-semibold'}>
          {currentTask.xp_value} XP
        </span>
      </div>

      {/* Flag Icon - Top Left Corner */}
      <button
        onClick={() => setShowFlagModal(true)}
        disabled={loading}
        className="absolute top-3 left-3 sm:top-6 sm:left-6 p-2 hover:bg-yellow-50 rounded-lg transition-all disabled:opacity-50 group"
        title="Flag this task as inappropriate"
      >
        <FlagIcon className="w-5 h-5 text-gray-400 group-hover:text-yellow-500 transition-colors" />
      </button>

      <div className={embedded ? 'mb-2 pr-16 pl-9' : 'mb-6 pr-20 sm:pr-24 pl-10 sm:pl-12'}>
        <h3 className={embedded ? 'text-base font-bold mb-1.5' : 'text-xl sm:text-2xl font-bold mb-4'}>
          {currentTask.title}
        </h3>
        <p className={embedded ? 'text-gray-700 text-sm leading-snug' : 'text-gray-700 text-base sm:text-lg leading-relaxed'}>
          {currentTask.description}
        </p>

        {/* Success criteria - the checkable "done" bar (carries the difficulty) */}
        {Array.isArray(currentTask.success_criteria) && currentTask.success_criteria.length > 0 && (
          <div className={embedded ? 'mt-2' : 'mt-4'}>
            <p className={embedded ? 'text-xs font-semibold text-gray-500 mb-1' : 'text-sm font-semibold text-gray-500 mb-2'}>
              Definition of Done
            </p>
            <ul className={embedded ? 'space-y-1' : 'space-y-1.5'}>
              {currentTask.success_criteria.map((criterion, i) => (
                <li key={i} className={`flex items-start gap-2 text-gray-700 ${embedded ? 'text-xs' : 'text-sm sm:text-base'}`}>
                  <CheckCircleIcon className={`text-green-500 flex-shrink-0 ${embedded ? 'w-3.5 h-3.5 mt-0.5' : 'w-4 h-4 mt-1'}`} />
                  <span>{criterion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!hideDiplomaSubjects && (
      <div className="flex flex-col gap-3 pl-10 sm:pl-12">
        {/* Pillar Badge — not for schools that switched the pillars off;
            they keep the credits row below, which is their taxonomy. */}
        {!hidePillars && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-4 py-2 bg-optio-purple/10 text-optio-purple-dark rounded-full">
              <span className="font-semibold">
                {getPillarData(currentTask.pillar).name}
              </span>
            </div>
          </div>
        )}

        {/* Subject XP Distribution */}
        {currentTask.diploma_subjects && Object.keys(currentTask.diploma_subjects).length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">
              Diploma Credits:
            </span>
            {Object.entries(currentTask.diploma_subjects).map(([subject, xp]) => (
              <div
                key={subject}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium"
              >
                <span>{subject}</span>
                <span className="text-blue-500">({xp} XP)</span>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Complexity Dial - rewrite this task easier or harder */}
      <div className={`flex items-center gap-2 ${embedded ? 'mt-3 pl-9' : 'mt-4 pl-10 sm:pl-12'}`}>
        <span className={embedded ? 'text-xs text-gray-500 font-medium' : 'text-sm text-gray-500 font-medium'}>
          {adjustingTask ? 'Adjusting task...' : 'Adjust difficulty:'}
        </span>
        <button
          onClick={() => handleAdjustTask('easier')}
          disabled={adjustingTask || loading || (taskAdjustments[currentTaskIndex] || 0) <= -MAX_ADJUST_STEPS}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border-2 border-gray-200 text-gray-700 hover:border-optio-purple hover:text-optio-purple transition-all disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold min-h-[36px]"
          title="Make this task easier"
        >
          <ArrowDownIcon className="w-3.5 h-3.5" />
          Easier
        </button>
        <button
          onClick={() => handleAdjustTask('harder')}
          disabled={adjustingTask || loading || (taskAdjustments[currentTaskIndex] || 0) >= MAX_ADJUST_STEPS}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border-2 border-gray-200 text-gray-700 hover:border-optio-purple hover:text-optio-purple transition-all disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold min-h-[36px]"
          title="Make this task harder"
        >
          <ArrowUpIcon className="w-3.5 h-3.5" />
          Harder
        </button>
        {adjustingTask && (
          <div className="w-4 h-4 border-2 border-gray-300 border-t-optio-purple rounded-full animate-spin" />
        )}
      </div>
    </div>

    {/* Action Buttons - 2 Column Layout */}
    <div className={embedded ? 'grid grid-cols-2 gap-3 mb-3' : 'grid grid-cols-2 gap-4 mb-6'}>
      {/* Skip Button */}
      <button
        onClick={handleSkipTask}
        disabled={loading || adjustingTask}
        className={`items-center justify-center border-2 border-red-300 bg-red-50 hover:bg-red-100 hover:border-red-400 transition-all disabled:opacity-50 ${
          embedded ? 'flex flex-row gap-2 p-2.5 rounded-lg min-h-[44px]' : 'flex flex-col p-6 rounded-xl'
        }`}
      >
        <XMarkIcon className={embedded ? 'w-5 h-5 text-red-600' : 'w-12 h-12 text-red-600 mb-2'} />
        <span className={embedded ? 'font-bold text-sm text-red-700' : 'font-bold text-lg text-red-700'}>
          Skip
        </span>
      </button>

      {/* Accept Button */}
      <button
        onClick={handleAcceptTask}
        disabled={loading || adjustingTask}
        className={`items-center justify-center border-2 border-green-300 bg-green-50 hover:bg-green-100 hover:border-green-400 transition-all disabled:opacity-50 ${
          embedded ? 'flex flex-row gap-2 p-2.5 rounded-lg min-h-[44px]' : 'flex flex-col p-6 rounded-xl'
        }`}
      >
        <CheckIcon className={embedded ? 'w-5 h-5 text-green-600' : 'w-12 h-12 text-green-600 mb-2'} />
        <span className={embedded ? 'font-bold text-sm text-green-700' : 'font-bold text-lg text-green-700'}>
          {loading ? 'Adding...' : 'Add'}
        </span>
      </button>
    </div>

    {/* Progress Summary */}
    <div className={embedded ? 'bg-blue-50 border border-blue-200 rounded-lg p-2.5' : 'bg-blue-50 border-2 border-blue-200 rounded-xl p-5'}>
      <p className={embedded ? 'text-xs text-blue-900' : 'text-sm text-blue-900'}>
        💡 <strong>Progress:</strong> You've accepted {acceptedTasks.length} task{acceptedTasks.length !== 1 ? 's' : ''} so far.
        {currentTaskIndex === generatedTasks.length - 1 && ' This is the last task!'}
      </p>
    </div>
  </div>
);

export default TaskReviewStep;
