// Everything above the evidence: title, the Steps and Edit affordances, the
// expandable description, the success criteria that define "done", and the
// pillar / XP / subject-credit badges.
import { TrophyIcon, ExclamationCircleIcon, CheckCircleIcon, SparklesIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import SubjectBadges from '../../common/SubjectBadges';
import { getSubjectName, subjectColor } from '../../../constants/subjects';
import QuestResourceList from '../QuestResourceList';
import useIsClamped from '../../../hooks/useIsClamped';

// optio-purple. Stands in for the pillar colour where pillars are hidden.
const BRAND_PURPLE = '#6d469b';

const TaskDetailsSection = ({ canUseTaskGeneration, isDescriptionExpanded, pillarData, pillarsVisible, setIsDescriptionExpanded, setIsEditModalOpen, setIsStepsModalOpen, task }) => {
  // Same guess, same wrong answer as the quest header had: 150 characters
  // against a three-line clamp offered "Show more" on descriptions that were
  // already whole (iCreate, 2026-09-22, eb48ad83). Ask the paragraph instead.
  const [descriptionRef, isDescriptionClamped] = useIsClamped(
    task.description, isDescriptionExpanded);
  const credits = task.subject_xp_distribution || task.school_subjects;
  const hasCredits = Array.isArray(credits)
    ? credits.length > 0
    : Boolean(credits) && Object.keys(credits).length > 0;
  const taskXp = task.xp_amount || task.xp_value;
  // Without the pillars every subject leads, each with its share of the XP,
  // biggest first -- one section instead of a lead chip over a "Credits" row
  // that repeated it (2026-09-28). A plain list carries no split, so its chips
  // are names only.
  const subjectChips = !hasCredits ? [] : Array.isArray(credits)
    ? credits.map(key => ({ key, xp: null }))
    : Object.entries(credits)
      .map(([key, xp]) => ({ key, xp: Number(xp) || 0 }))
      .sort((a, b) => b.xp - a.xp);
  // One subject holding all the XP already says the total.
  const showTotalXp = pillarsVisible || subjectChips.length !== 1 || subjectChips[0].xp !== Number(taskXp);

  return (
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
          ref={descriptionRef}
          className={`text-sm text-gray-600 leading-relaxed whitespace-pre-line ${isDescriptionExpanded ? '' : 'line-clamp-3'}`}
        >
          {task.description}
        </p>
        {(isDescriptionClamped || isDescriptionExpanded) && (
          <button
            onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
            className="text-xs text-optio-purple font-medium mt-2 touch-manipulation min-h-[32px] flex items-center"
          >
            {isDescriptionExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    )}

    {/* What the teacher attached to THIS task. The point of the feature: a
        worksheet for step 3 lives on step 3, not in one undifferentiated list
        on the class where nobody can tell which task it is for. */}
    <QuestResourceList resources={task.resources} className="mb-5" />

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
      {/* Without the pillar (a student 13+, or a school that switched them
          off) the diploma subjects lead: "Language Arts", not
          "Communication" (2026-09-28). */}
      {!pillarsVisible && subjectChips.map(({ key, xp }) => (
        <div
          key={key}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: subjectColor(key) }}
          data-testid="task-subject-chip"
        >
          <div className="w-2 h-2 rounded-full bg-white/40" />
          {getSubjectName(key)}
          {xp !== null && <span className="font-bold">{xp} XP</span>}
        </div>
      ))}

      {/* XP badge. It borrows the pillar's colour, so without the
          pillar shown it falls back to the brand purple. */}
      {showTotalXp && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold"
          style={{
            backgroundColor: `${pillarsVisible ? pillarData?.color : BRAND_PURPLE}15`,
            color: pillarsVisible ? pillarData?.color : BRAND_PURPLE
          }}
        >
          <TrophyIcon className="w-4 h-4" />
          {!pillarsVisible && subjectChips.length > 1 && <span className="font-medium">Total</span>}
          {taskXp} XP
        </div>
      )}
    </div>

    {/* Subject Credits - separate row, only beside a pillar; without one the
        subjects are the chips above.
        Emptiness, not presence: a task the author marked as not counting
        toward credit carries {} here, and {} is truthy, so the old check drew
        a "Credits" heading with no subjects under it (iCreate, f2c4d88e). */}
    {pillarsVisible && hasCredits && (
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
};

export default TaskDetailsSection;
