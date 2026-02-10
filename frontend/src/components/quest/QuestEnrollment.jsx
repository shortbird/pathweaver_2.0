import React from 'react';
import { getPillarData } from '../../utils/pillarMappings';
import SampleTaskCard from './SampleTaskCard';
import { FireIcon, BookOpenIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

/**
 * QuestEnrollment - Handles enrollment UI, sample tasks, and preset tasks display
 *
 * Updated for unified quest model - no longer depends on quest_type.
 * Uses has_optional_tasks/allow_custom_tasks for behavior determination.
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

  // Check if quest has required tasks (preset curriculum)
  const hasRequiredTasks = quest?.preset_tasks?.length > 0 ||
    quest?.template_tasks?.some(t => t.is_required);

  // Show enrollment button for:
  // 1. Quests that don't allow customization (no path selection available)
  // 2. Quests that have required tasks (preset curriculum - skip path selection)
  // 3. Completed quests (restart option)
  // 4. Unenrolled quests that fall through other conditions
  const showEnrollmentButton = !quest?.lms_platform && (
    (!allowsCustomization || hasRequiredTasks) && (
      isQuestCompleted ||
      !quest?.user_enrollment ||
      (quest?.user_enrollment && totalTasks === 0)
    )
  );

  // Show "Ready to personalize" message for enrolled quests with no tasks
  const showPersonalizationPrompt = quest?.quest_tasks?.length === 0 && quest?.user_enrollment;

  // Show template tasks for unenrolled quests (unified: check for any template tasks)
  // Legacy support: sample_tasks for optio, preset_tasks for course
  const hasTemplateTasks = quest?.template_tasks?.length > 0 ||
    quest?.sample_tasks?.length > 0 ||
    quest?.preset_tasks?.length > 0;
  const showSampleTasks = !quest?.user_enrollment && allowsCustomization && (quest?.sample_tasks?.length > 0 || quest?.template_tasks?.some(t => !t.is_required));
  const showPresetTasks = !quest?.user_enrollment && (quest?.preset_tasks?.length > 0 || quest?.template_tasks?.some(t => t.is_required));

  return (
    <>
      {/* Enrollment Button - Only show for unenrolled or completed quests (not for enrolled with 0 tasks) */}
      {showEnrollmentButton && !(quest?.user_enrollment && totalTasks === 0) && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex gap-4">
            <button
              onClick={() => onEnroll()}
              onMouseEnter={onPreloadWizard}
              onFocus={onPreloadWizard}
              disabled={isEnrolling}
              className="flex-1 bg-gradient-primary text-white py-4 px-8 rounded-[30px] hover:shadow-[0_8px_30px_rgba(239,89,123,0.3)] hover:-translate-y-1 transition-all duration-300 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manipulation"
            >
              <FireIcon className="w-5 h-5 inline mr-2" />
              {isEnrolling ? 'Picking Up...' : 'Pick Up Quest'}
            </button>
          </div>
        </div>
      )}

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

      {/* Optional Task Suggestions */}
      {showSampleTasks && (
        <div className="mb-8">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
              Sample Tasks for Inspiration
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins' }}>
              These spark ideas. Choose what resonates or create your own path!
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quest.sample_tasks.map((task) => (
              <SampleTaskCard
                key={task.id}
                task={task}
                onAdd={async () => {
                  toast.error('Please pick up this quest first, then you can add sample tasks!');
                }}
                disabled={true}
              />
            ))}
          </div>
        </div>
      )}

      {/* Required Tasks */}
      {showPresetTasks && (
        <div className="mb-8">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
              Required Tasks
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins' }}>
              This quest has preset tasks aligned with the curriculum
            </p>
          </div>

          <div className="space-y-3">
            {(quest.preset_tasks || quest.template_tasks?.filter(t => t.is_required) || []).map((task, index) => {
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
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>
                          {task.title}
                        </h3>
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

          {/* Enrollment CTA for preset tasks */}
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
