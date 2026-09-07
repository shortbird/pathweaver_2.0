// Everything above the evidence: title, the Steps and Edit affordances, the
// expandable description, the success criteria that define "done", and the
// pillar / XP / subject-credit badges.
import { TrophyIcon, ExclamationCircleIcon, CheckCircleIcon, SparklesIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import SubjectBadges from '../../common/SubjectBadges';

// optio-purple. Stands in for the pillar colour where pillars are hidden.
const BRAND_PURPLE = '#6d469b';

const TaskDetailsSection = ({ canUseTaskGeneration, isDescriptionExpanded, pillarData, pillarsVisible, setIsDescriptionExpanded, setIsEditModalOpen, setIsStepsModalOpen, task }) => (
  <div className="px-4 sm:px-6 py-5 border-b border-gray-200">
    {/* Title row with Steps button */}
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-start gap-3 min-w-0">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">
          {task.title}
        </h2>
        {task.is_required && (
          <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-md border border-amber-200 mt-1">
            <ExclamationCircleIcon className="w-4 h-4" />
            Required
          </span>
        )}
      </div>
      {/* Action buttons - right aligned */}
      <div className="flex-shrink-0 flex items-center gap-2">
        <button
          onClick={() => setIsEditModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          title={pillarsVisible ? 'Edit pillar, XP, and diploma credit' : 'Edit XP and diploma credit'}
        >
          <PencilSquareIcon className="w-4 h-4" />
          Edit
        </button>
        {canUseTaskGeneration && !task.is_completed && (
          <button
            onClick={() => setIsStepsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-optio-purple bg-optio-purple/10 hover:bg-optio-purple/20 rounded-lg transition-colors"
          >
            <SparklesIcon className="w-4 h-4" />
            Steps
          </button>
        )}
      </div>
    </div>

    {/* Description - expandable on tap */}
    {task.description && (
      <div className="mb-5">
        <p
          className={`text-sm text-gray-600 leading-relaxed ${isDescriptionExpanded ? '' : 'line-clamp-3'}`}
        >
          {task.description}
        </p>
        {task.description.length > 150 && (
          <button
            onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
            className="text-xs text-optio-purple font-medium mt-2 touch-manipulation min-h-[32px] flex items-center"
          >
            {isDescriptionExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    )}

    {/* Success criteria - the checkable "done" bar for this task */}
    {Array.isArray(task.success_criteria) && task.success_criteria.length > 0 && (
      <div className="mb-5 p-3 bg-gray-50 rounded-lg border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Definition of Done
        </p>
        <ul className="space-y-1.5">
          {task.success_criteria.map((criterion, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <CheckCircleIcon className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" />
              <span>{criterion}</span>
            </li>
          ))}
        </ul>
      </div>
    )}

    {/* Task metadata cards */}
    <div className="flex flex-wrap items-center gap-3">
      {/* Pillar badge. Hidden for school training, where which of
          the five pillars an onboarding task grew is noise, and for
          schools that have switched the pillars off entirely. */}
      {pillarsVisible && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: pillarData?.color }}
        >
          <div className="w-2 h-2 rounded-full bg-white/40" />
          {pillarData?.name}
        </div>
      )}

      {/* XP badge. It borrows the pillar's colour, so without the
          pillar shown it falls back to the brand purple. */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold"
        style={{
          backgroundColor: `${pillarsVisible ? pillarData?.color : BRAND_PURPLE}15`,
          color: pillarsVisible ? pillarData?.color : BRAND_PURPLE
        }}
      >
        <TrophyIcon className="w-4 h-4" />
        {task.xp_amount || task.xp_value} XP
      </div>
    </div>

    {/* Subject Credits - separate row */}
    {(task.subject_xp_distribution || task.school_subjects) && (
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Credits</span>
          <SubjectBadges
            subjectXpDistribution={task.subject_xp_distribution || task.school_subjects}
            compact={false}
            maxDisplay={4}
          />
        </div>
      </div>
    )}
  </div>
);

export default TaskDetailsSection;
