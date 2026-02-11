import React from 'react';
import { getPillarData } from '../../utils/pillarMappings';
import { FireIcon, BookOpenIcon } from '@heroicons/react/24/outline';

/**
 * QuestEnrollment - Handles enrollment UI and template tasks display
 *
 * Updated for unified quest model using template_tasks.
 * Shows all template tasks (required and optional) before enrollment.
 */
const QuestEnrollment = ({
  quest,
  isQuestCompleted,
  totalTasks,
  isEnrolling,
  onEnroll,
  onShowPersonalizationWizard,
  onPreloadWizard
}) => {
  // Determine quest behavior based on unified model
  const allowsCustomization = quest?.allow_custom_tasks !== false;

  // Get template tasks
  const templateTasks = quest?.template_tasks || [];
  const requiredTasks = templateTasks.filter(t => t.is_required);
  const optionalTasks = templateTasks.filter(t => !t.is_required);
  const hasTemplateTasks = templateTasks.length > 0;

  // Show "Ready to personalize" message for enrolled quests with no tasks
  const showPersonalizationPrompt = quest?.quest_tasks?.length === 0 && quest?.user_enrollment;

  // Show template tasks when not enrolled and quest has template tasks
  const showTemplateTasks = !quest?.user_enrollment && hasTemplateTasks;

  return (
    <>
      {/* Ready to Personalize Prompt */}
      {showPersonalizationPrompt && (
        <div className="text-center py-12 bg-white rounded-xl shadow-md">
          <BookOpenIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg text-gray-600 mb-2" style={{ fontFamily: 'Poppins' }}>
            Ready to personalize this quest?
          </p>
          <p className="text-sm text-gray-500 mb-6" style={{ fontFamily: 'Poppins' }}>
            {allowsCustomization
              ? 'Create custom tasks, write your own, or browse the task library'
              : 'This quest has no preset tasks yet. Contact your advisor.'}
          </p>
          <button
            onClick={() => onShowPersonalizationWizard()}
            onMouseEnter={onPreloadWizard}
            onFocus={onPreloadWizard}
            className="px-6 py-3 bg-gradient-primary text-white rounded-lg font-semibold hover:opacity-90 min-h-[44px] touch-manipulation"
            style={{ fontFamily: 'Poppins' }}
          >
            Start Personalizing
          </button>
        </div>
      )}

      {/* Template Tasks Display */}
      {showTemplateTasks && (
        <div className="mb-8">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
              Quest Tasks
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins' }}>
              {requiredTasks.length > 0 && optionalTasks.length > 0
                ? 'Complete the required tasks and choose from optional ones'
                : requiredTasks.length > 0
                  ? 'Complete these tasks to finish the quest'
                  : 'Choose tasks that interest you'}
            </p>
          </div>

          <div className="space-y-3">
            {templateTasks.map((task, index) => {
              const pillarData = getPillarData(task.pillar);
              return (
                <div
                  key={task.id}
                  className="bg-white rounded-xl p-4 border-2 border-gray-100 hover:border-gray-200 transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
                      style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
                    >
                      {index + 1}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>
                          {task.title}
                        </h3>
                        {task.is_required ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                            Required
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                            Optional
                          </span>
                        )}
                        <div
                          className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            backgroundColor: `${pillarData.color}20`,
                            color: pillarData.color,
                            fontFamily: 'Poppins'
                          }}
                        >
                          {pillarData.name}
                        </div>
                        <div
                          className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
                        >
                          {task.xp_value} XP
                        </div>
                      </div>
                      {task.description && (
                        <p className="text-sm text-gray-700" style={{ fontFamily: 'Poppins' }}>
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Enrollment CTA */}
          {!quest?.user_enrollment && (
            <div className="mt-6 text-center">
              <button
                onClick={() => onEnroll()}
                disabled={isEnrolling}
                className="bg-gradient-primary text-white py-4 px-8 rounded-[30px] hover:shadow-[0_8px_30px_rgba(239,89,123,0.3)] hover:-translate-y-1 transition-all duration-300 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manipulation"
                style={{ fontFamily: 'Poppins' }}
              >
                <FireIcon className="w-5 h-5 inline mr-2" />
                {isEnrolling ? 'Picking Up...' : 'Pick Up Quest'}
              </button>
            </div>
          )}
        </div>
      )}

    </>
  );
};

export default QuestEnrollment;
