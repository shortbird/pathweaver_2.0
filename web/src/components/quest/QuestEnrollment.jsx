import React from 'react';
import { getSubjectName } from '../../constants/subjects';
import useHidePillars from '../../hooks/useHidePillars';
import TemplateTaskPreview from './TemplateTaskPreview';
import { BookOpenIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

// Staff see the student-facing Start Quest button too (they pick quests up to
// build task lists, see GiveStudentsMyTasksCard), but an org_admin asked what
// the button means for her students (ticket a87602cf). They get one line that
// says what it does when a student clicks it.
const STAFF_ROLES = ['org_admin', 'advisor', 'superadmin', 'campus_coordinator'];

/**
 * QuestEnrollment - Handles enrollment UI and template tasks display
 *
 * Updated for unified quest model using template_tasks.
 * Shows the template tasks before enrollment (TemplateTaskPreview), or,
 * for a quest with none, a start prompt that enrolls and opens the wizard.
 */
const QuestEnrollment = ({
  quest,
  isQuestCompleted,
  totalTasks,
  isEnrolling,
  onEnroll,
  onShowPersonalizationWizard,
  onPreloadWizard,
  hidePersonalizationPrompt = false
}) => {
  const { hasAnyRole } = useAuth();
  const isStaffViewer = !!hasAnyRole?.(STAFF_ROLES);
  // 13+ (or a school with the pillars off): each task is labelled by the
  // subject it counts toward and tinted in the brand colour, not its pillar's.
  const hidePillars = useHidePillars();

  // Determine quest behavior based on unified model
  const allowsCustomization = quest?.allow_custom_tasks !== false;

  // Get template tasks
  const templateTasks = quest?.template_tasks || [];
  const hasTemplateTasks = templateTasks.length > 0;

  // Show "Ready to personalize" message for enrolled quests with no tasks
  // Only for quests without template tasks (template quests don't use the wizard)
  const showPersonalizationPrompt = quest?.quest_tasks?.length === 0 && quest?.user_enrollment && !hasTemplateTasks && !hidePersonalizationPrompt;

  // Show template tasks when not enrolled and quest has template tasks
  const showTemplateTasks = !quest?.user_enrollment && hasTemplateTasks;

  // Not enrolled and nothing authored to show: this card is the only way to
  // start the quest. (Until 2026-09-28 the AI "starter paths" card did this;
  // it was removed and this took over its enroll.) An ended enrollment is
  // excluded -- QuestDetail offers Reopen for that. Enrolling opens the
  // personalization wizard (QuestDetail.handleEnroll).
  const showStartPrompt = !quest?.user_enrollment && !quest?.completed_enrollment && !hasTemplateTasks;

  // A credit class the student just created lands here empty. "Personalize this
  // quest" is the wrong mental model for it — the class is theirs already, and
  // what they need to know is that tasks are what earn the credit.
  const isClassQuest = quest?.quest_type === 'class';
  const classSubjectName = getSubjectName(quest?.transcript_subject);

  return (
    <>
      {/* Ready to Personalize Prompt */}
      {showPersonalizationPrompt && (
        <div className="text-center py-12 bg-white rounded-xl shadow-md">
          <BookOpenIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg text-gray-600 mb-2">
            {isClassQuest ? 'Your class is ready — add your first tasks' : 'Ready to personalize this quest?'}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            {isClassQuest
              ? `Every task you complete earns XP toward your${classSubjectName ? ` ${classSubjectName}` : ''} credit. Get AI suggestions based on your interests, or write your own.`
              : allowsCustomization
                ? 'Create custom tasks, write your own, or browse the task library'
                : 'This quest has no preset tasks yet. Contact your teacher.'}
          </p>
          <button
            onClick={() => onShowPersonalizationWizard()}
            onMouseEnter={onPreloadWizard}
            onFocus={onPreloadWizard}
            className="btn-primary min-h-[44px] touch-manipulation"
          >
            {isClassQuest ? 'Add Your First Tasks' : 'Start Personalizing'}
          </button>
        </div>
      )}

      {/* Start Prompt: not enrolled, no authored tasks. Programs with a
          simplified task view (Treehouse littles) still need the button --
          nothing else would start the quest -- but they skip the wizard, so
          the copy only says "start". */}
      {showStartPrompt && (
        <div className="text-center py-12 bg-white rounded-xl shadow-md">
          <BookOpenIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg text-gray-600 mb-2">
            {hidePersonalizationPrompt ? 'Ready to start this quest?' : 'Ready to personalize this quest?'}
          </p>
          {!hidePersonalizationPrompt && (
            <p className="text-sm text-gray-500 mb-6">
              {allowsCustomization
                ? 'Start the quest, then create custom tasks, write your own, or browse the task library'
                : 'This quest has no preset tasks yet. Contact your teacher.'}
            </p>
          )}
          {(allowsCustomization || hidePersonalizationPrompt) && (
            <>
              <button
                onClick={() => onEnroll()}
                onMouseEnter={onPreloadWizard}
                onFocus={onPreloadWizard}
                disabled={isEnrolling}
                className={`btn-primary min-h-[44px] touch-manipulation${hidePersonalizationPrompt ? ' mt-4' : ''}`}
              >
                {isEnrolling
                  ? 'Starting...'
                  : hidePersonalizationPrompt ? 'Start Quest' : 'Start Personalizing'}
              </button>
              {isStaffViewer && (
                <p className="mt-2 text-sm text-gray-500">
                  {hidePersonalizationPrompt
                    ? 'Students click Start Quest to add this quest to their account.'
                    : 'Students click Start Personalizing to add this quest to their account and build their own tasks.'}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Template Tasks: Start first, then the tasks -- the optional ones
          as ideas the student picks to take with them (TemplateTaskPreview). */}
      {showTemplateTasks && (
        <TemplateTaskPreview
          quest={quest}
          tasks={templateTasks}
          hidePillars={hidePillars}
          isEnrolling={isEnrolling}
          onEnroll={onEnroll}
          isStaffViewer={isStaffViewer}
        />
      )}

    </>
  );
};

export default QuestEnrollment;
