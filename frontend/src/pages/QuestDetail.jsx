import React, { lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuestDetailData } from '../hooks/useQuestDetailData';
import { queryKeys } from '../utils/queryKeys';
import api from '../services/api';
import QuestDetailHeader from '../components/quest/QuestDetailHeader';
import QuestEnrollment from '../components/quest/QuestEnrollment';
import QuestApproachExamples from '../components/quest/QuestApproachExamples';
import QuestMetadataCard from '../components/quest/QuestMetadataCard';
import toast from 'react-hot-toast';
import logger from '../utils/logger';
import { useActivityTracking } from '../hooks/useActivityTracking';

// Lazy load heavy components
const TaskEvidenceModal = lazy(() => import('../components/quest/TaskEvidenceModal'));
const TaskDetailModal = lazy(() => import('../components/quest/TaskDetailModal'));
const QuestPersonalizationWizard = lazy(() => import('../components/quests/QuestPersonalizationWizard'));
const QuestCompletionCelebration = lazy(() => import('../components/quest/QuestCompletionCelebration'));
const TaskTimeline = lazy(() => import('../components/quest/TaskTimeline'));
const TaskWorkspace = lazy(() => import('../components/quest/TaskWorkspace'));
const RestartQuestModal = lazy(() => import('../components/quest/RestartQuestModal'));

// Loading spinner
const LoadingFallback = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
  </div>
);

// Full-screen wizard loading overlay
const WizardLoadingOverlay = () => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-xl p-8 flex flex-col items-center gap-4 shadow-2xl">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-optio-purple border-t-transparent"></div>
      <p className="text-lg font-semibold text-gray-700" style={{ fontFamily: 'Poppins' }}>
        Loading personalization wizard...
      </p>
      <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins' }}>
        Getting everything ready for you
      </p>
    </div>
  </div>
);

// Preload the personalization wizard component
const preloadWizard = () => {
  import('../components/quests/QuestPersonalizationWizard');
};

const QuestDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { trackTabSwitch, trackButtonClick, trackModalOpen, trackModalClose } = useActivityTracking('QuestDetail');

  // Use custom hook for all data management
  const {
    quest,
    isLoading,
    error,
    refetchQuest,
    enrollMutation,
    endQuestMutation,
    isEnrolling,
    selectedTask,
    setSelectedTask,
    showPersonalizationWizard,
    setShowPersonalizationWizard,
    showQuestCompletionCelebration,
    setShowQuestCompletionCelebration,
    displayMode,
    setDisplayMode,
    showRestartModal,
    setShowRestartModal,
    restartModalData,
    setRestartModalData,
    xpData,
    pillarBreakdown,
    completedTasks,
    totalTasks,
    progressPercentage,
    isQuestCompleted,
    queryClient
  } = useQuestDetailData(id);

  // Local state for modals and UI
  const [showTaskModal, setShowTaskModal] = React.useState(false);
  const [showTaskDetailModal, setShowTaskDetailModal] = React.useState(false);
  const [taskDetailToShow, setTaskDetailToShow] = React.useState(null);
  const [droppingTaskId, setDroppingTaskId] = React.useState(null);
  const [showMobileDrawer, setShowMobileDrawer] = React.useState(false);
  const [collaborators, setCollaborators] = React.useState([]);

  const { earnedXP } = xpData;

  // Fetch collaborators for this quest
  React.useEffect(() => {
    const fetchCollaborators = async () => {
      if (!quest?.id || !user) return;

      try {
        const response = await api.get(`/api/collaborations/quest/${quest.id}/members`);
        if (response.data.success && response.data.members?.length > 1) {
          // Filter out current user from collaborators list
          const otherMembers = response.data.members.filter(m => m.id !== user.id);
          setCollaborators(otherMembers);
        }
      } catch (err) {
        // Silently fail - collaboration is optional
        console.debug('No collaboration for this quest:', err);
      }
    };

    fetchCollaborators();
  }, [quest?.id, user]);

  // Handle enrollment
  const handleEnroll = async (options = {}) => {
    if (!user) {
      navigate('/login');
      return;
    }

    enrollMutation.mutate({ questId: id, options }, {
      onSuccess: async (data) => {
        queryClient.invalidateQueries(queryKeys.quests.detail(id));
        await refetchQuest();

        const skipWizard = data?.enrollment?.skip_wizard || data?.skip_wizard || data?.tasks_loaded || false;

        if (skipWizard) {
          if (data?.tasks_loaded) {
            toast.success(`Restarted quest with ${data.tasks_loaded} previous tasks!`);
          } else {
            toast.success('Enrolled! Your tasks are ready.');
          }
        } else {
          setTimeout(() => {
            setShowPersonalizationWizard(true);
          }, 100);
        }
      },
      onError: (error) => {
        if (error.response?.status === 409 && error.response?.data?.requires_confirmation) {
          const previousTaskCount = error.response.data.previous_task_count || 0;
          setRestartModalData({
            previousTaskCount: previousTaskCount,
            questTitle: quest?.title || 'this quest'
          });
          setShowRestartModal(true);
        } else {
          console.error('Enrollment failed:', error);
        }
      }
    });
  };

  const handlePersonalizationComplete = async () => {
    setShowPersonalizationWizard(false);
    queryClient.invalidateQueries(queryKeys.quests.detail(id));
    await refetchQuest();
    toast.success('Quest personalized successfully!');
  };

  const handlePersonalizationCancel = () => {
    setShowPersonalizationWizard(false);
  };

  const handleLoadPreviousTasks = () => {
    setShowRestartModal(false);
    handleEnroll({ load_previous_tasks: true, force_new: true });
  };

  const handleStartFresh = () => {
    setShowRestartModal(false);
    handleEnroll({ force_new: true });
  };

  const handleDropTask = async (taskId) => {
    if (!window.confirm('Remove this task from your active quest? You can add it back later from the task library.')) {
      return;
    }

    setDroppingTaskId(taskId);

    try {
      await api.delete(`/api/tasks/${taskId}`);
      queryClient.invalidateQueries(queryKeys.quests.detail(id));
      await refetchQuest();
      toast.success('Task removed from your quest');
    } catch (err) {
      console.error('Error removing task:', err);
      toast.error(err.response?.data?.error || 'Failed to remove task');
    } finally {
      setDroppingTaskId(null);
    }
  };

  const handleEndQuest = async () => {
    if (!quest?.user_enrollment) return;

    endQuestMutation.mutate(id, {
      onSuccess: () => {
        toast.success('Quest completed! Returning to dashboard...');
        navigate('/');
      },
      onError: (error) => {
        console.error('Error ending quest:', error);
        toast.error('Failed to finish quest. Please try again.');
      }
    });
  };

  const handleAddMoreTasks = () => {
    setShowQuestCompletionCelebration(false);
    setShowPersonalizationWizard(true);
  };

  const handleFinishQuestFromCelebration = () => {
    setShowQuestCompletionCelebration(false);
    handleEndQuest();
  };

  const handleTaskCompletion = async (completionData) => {
    logger.debug('[QUEST_DETAIL] ========== TASK COMPLETION HANDLER START ==========');
    logger.debug('[QUEST_DETAIL] completionData:', completionData);

    if (selectedTask) {
      logger.debug('[QUEST_DETAIL] About to call flushSync for state + cache update');

      flushSync(() => {
        logger.debug('[QUEST_DETAIL] Inside flushSync - updating selectedTask state');
        setSelectedTask(prev => {
          const updated = prev ? { ...prev, is_completed: true } : null;
          logger.debug('[QUEST_DETAIL] selectedTask state updated to:', {
            id: updated?.id?.substring(0, 8),
            is_completed: updated?.is_completed
          });
          return updated;
        });

        logger.debug('[QUEST_DETAIL] Inside flushSync - updating React Query cache');
        queryClient.setQueryData(queryKeys.quests.detail(id), (oldData) => {
          if (!oldData) {
            logger.debug('[QUEST_DETAIL] No oldData in cache, returning null');
            return oldData;
          }

          logger.debug('[QUEST_DETAIL] Old cache data quest_tasks count:', oldData.quest_tasks?.length);
          logger.debug('[QUEST_DETAIL] Updating task in cache:', selectedTask.id.substring(0, 8));

          const updatedTasks = oldData.quest_tasks?.map(task => {
            if (task.id === selectedTask.id) {
              logger.debug('[QUEST_DETAIL] Found matching task, marking is_completed=true');
              return { ...task, is_completed: true };
            }
            return task;
          }) || [];

          const completedCount = updatedTasks.filter(task => task.is_completed).length;
          const totalCount = updatedTasks.length;
          const newProgressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
          const isNewlyCompleted = newProgressPercentage === 100 && !oldData.completed_enrollment;

          logger.debug('[QUEST_DETAIL] Cache update complete:', {
            completedCount,
            totalCount,
            progressPercentage: newProgressPercentage,
            isNewlyCompleted
          });

          if (isNewlyCompleted) {
            logger.debug('[QUEST_DETAIL] Quest newly completed - showing celebration');
            setTimeout(() => {
              setShowQuestCompletionCelebration(true);
            }, 500);
          }

          return {
            ...oldData,
            quest_tasks: updatedTasks,
            progress: {
              ...oldData.progress,
              percentage: newProgressPercentage,
              completed_tasks: completedCount,
              total_tasks: totalCount
            },
            completed_enrollment: isNewlyCompleted ? true : oldData.completed_enrollment
          };
        });
      });

      logger.debug('[QUEST_DETAIL] flushSync completed - all updates should be synchronous');
    }

    // Invalidate course cache so XP updates immediately when navigating back
    logger.debug('[QUEST_DETAIL] Invalidating course cache for XP update');
    queryKeys.invalidateCourses(queryClient);

    logger.debug('[QUEST_DETAIL] Closing modal and clearing selectedTask');
    setShowTaskModal(false);
    setSelectedTask(null);

    logger.debug('[QUEST_DETAIL] ========== TASK COMPLETION HANDLER END ==========');
  };

  const handleTaskReorder = async (oldIndex, newIndex) => {
    if (!quest?.quest_tasks) return;

    const reorderedTasks = Array.from(quest.quest_tasks);
    const [movedTask] = reorderedTasks.splice(oldIndex, 1);
    reorderedTasks.splice(newIndex, 0, movedTask);

    const updatedTasks = reorderedTasks.map((task, index) => ({
      ...task,
      order_index: index
    }));

    queryClient.setQueryData(queryKeys.quests.detail(id), (oldData) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        quest_tasks: updatedTasks
      };
    });

    try {
      await api.put(`/api/quests/${id}/tasks/reorder`, {
        task_ids: updatedTasks.map(t => t.id)
      });
    } catch (err) {
      console.error('Error reordering tasks:', err);
      toast.error('Failed to save task order');
      refetchQuest();
    }
  };

  const handleDisplayModeChange = async (newMode) => {
    const previousMode = displayMode;
    setDisplayMode(newMode);

    // Track tab switch
    trackTabSwitch(newMode, previousMode);

    try {
      await api.put(`/api/quests/${id}/display-mode`, {
        display_mode: newMode
      });
    } catch (err) {
      console.error('Error updating display mode:', err);
    }
  };

  const handleTaskSelect = (task) => {
    setSelectedTask(task);
    if (window.innerWidth < 768) {
      setShowMobileDrawer(false);
    }
  };

  // Handle error display
  if (error) {
    const errorMsg = error.response?.status === 404
      ? 'This quest could not be found. It may have been removed or is no longer available.'
      : error.response?.status === 403
      ? 'You do not have permission to view this quest.'
      : 'Unable to load quest details. Please refresh the page and try again.';

    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Quest Not Found</h2>
          <p className="text-gray-600 mb-4">{errorMsg}</p>
          <button
            onClick={() => refetchQuest()}
            className="px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-lg transition-all mr-4 min-h-[44px] touch-manipulation"
          >
            Retry
          </button>
          <button
            onClick={() => navigate('/quests')}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all min-h-[44px] touch-manipulation"
          >
            Back to Quests
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="bg-gray-300 rounded-xl h-64 mb-8"></div>
          <div className="space-y-4">
            <div className="h-6 bg-gray-300 rounded w-3/4"></div>
            <div className="h-4 bg-gray-300 rounded w-1/2"></div>
            <div className="h-32 bg-gray-300 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!quest) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">Quest not found</div>
          <button
            onClick={() => navigate('/quests')}
            className="bg-gradient-primary text-white px-6 py-3 rounded-[30px] hover:shadow-lg transition-all min-h-[44px] touch-manipulation"
          >
            Back to Quests
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <QuestDetailHeader
        quest={quest}
        earnedXP={earnedXP}
        isQuestCompleted={isQuestCompleted}
        onEndQuest={handleEndQuest}
        endQuestMutation={endQuestMutation}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-4">
        {/* Starter Paths Section - only show for non-enrolled users */}
        <QuestApproachExamples
          questId={quest.id}
          questTitle={quest.title}
          questDescription={quest.big_idea || quest.description}
          cachedApproaches={quest.approach_examples}
          isEnrolled={!!quest.user_enrollment || isQuestCompleted}
          onEnrollmentComplete={() => {
            // Refetch quest data to show tasks
            window.location.reload();
          }}
          className="mb-4"
        />

        {/* Quest Metadata Card - Deliverables and details */}
        <QuestMetadataCard
          quest={quest}
          className="mb-4"
        />

        {/* Collaborators Section */}
        {collaborators.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Collaborating With</h3>
              <span className="text-sm text-gray-500">{collaborators.length} {collaborators.length === 1 ? 'person' : 'people'}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {collaborators.map(member => (
                <div
                  key={member.id}
                  className="flex items-center gap-2 bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 rounded-lg px-3 py-2 border border-optio-purple/20"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center text-white font-semibold text-sm">
                    {member.display_name?.charAt(0)?.toUpperCase() || member.email?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900">
                      {member.display_name || member.email}
                    </span>
                    {member.display_name && member.email && (
                      <span className="text-xs text-gray-500">{member.email}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enrollment and Sample/Preset Tasks */}
        <QuestEnrollment
          quest={quest}
          isQuestCompleted={isQuestCompleted}
          totalTasks={totalTasks}
          isEnrolling={isEnrolling}
          onEnroll={handleEnroll}
          onShowPersonalizationWizard={() => setShowPersonalizationWizard(true)}
          onPreloadWizard={preloadWizard}
        />

        {/* Task Display - Single Container with Integrated Task List */}
        {quest.user_enrollment && quest.quest_tasks && quest.quest_tasks.length > 0 && (
          <div className="bg-white rounded-xl shadow-md overflow-hidden h-[calc(100vh-180px)] min-h-[500px]">
            <Suspense fallback={<LoadingFallback />}>
              <TaskWorkspace
                task={selectedTask}
                tasks={quest.quest_tasks}
                questId={quest.id}
                onTaskSelect={handleTaskSelect}
                onTaskReorder={handleTaskReorder}
                onTaskComplete={handleTaskCompletion}
                onAddTask={() => setShowPersonalizationWizard(true)}
                onRemoveTask={handleDropTask}
                onClose={() => setSelectedTask(null)}
              />
            </Suspense>
          </div>
        )}
      </div>

      {/* Modals */}
      {showTaskModal && selectedTask && (
        <Suspense fallback={<LoadingFallback />}>
          <TaskEvidenceModal
            task={selectedTask}
            questId={quest.id}
            onComplete={handleTaskCompletion}
            onClose={() => setShowTaskModal(false)}
          />
        </Suspense>
      )}

      {showTaskDetailModal && (
        <Suspense fallback={<LoadingFallback />}>
          <TaskDetailModal
            task={taskDetailToShow}
            isOpen={showTaskDetailModal}
            onClose={() => {
              setShowTaskDetailModal(false);
              setTaskDetailToShow(null);
            }}
          />
        </Suspense>
      )}

      {showPersonalizationWizard && (
        <Suspense fallback={<WizardLoadingOverlay />}>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <QuestPersonalizationWizard
                questId={quest.id}
                questTitle={quest.title}
                onComplete={handlePersonalizationComplete}
                onCancel={handlePersonalizationCancel}
              />
            </div>
          </div>
        </Suspense>
      )}

      {showQuestCompletionCelebration && quest && (
        <Suspense fallback={<LoadingFallback />}>
          <QuestCompletionCelebration
            quest={quest}
            completedTasksCount={quest.progress?.completed_tasks || 0}
            totalXP={
              quest.quest_tasks
                ?.filter(task => task.is_completed)
                .reduce((sum, task) => sum + (task.xp_value || 0), 0) || 0
            }
            onAddMoreTasks={handleAddMoreTasks}
            onFinishQuest={handleFinishQuestFromCelebration}
            onClose={() => setShowQuestCompletionCelebration(false)}
          />
        </Suspense>
      )}

      <Suspense fallback={<LoadingFallback />}>
        <RestartQuestModal
          isOpen={showRestartModal}
          questTitle={restartModalData.questTitle}
          previousTaskCount={restartModalData.previousTaskCount}
          onLoadPreviousTasks={handleLoadPreviousTasks}
          onStartFresh={handleStartFresh}
          onClose={() => setShowRestartModal(false)}
        />
      </Suspense>

    </div>
  );
};

export default QuestDetail;
